import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export class CurtailIQStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const imageDigest = new cdk.CfnParameter(this, 'ImageDigest', {
      type: 'String', description: 'Immutable ECR image digest sha256:<64 lowercase hex>.',
      allowedPattern: '^sha256:[a-f0-9]{64}$',
      constraintDescription: 'Must be an immutable sha256 digest.',
    });
    const permissionsBoundaryArn = new cdk.CfnParameter(this, 'PermissionsBoundaryArn', {
      type: 'String', description: 'ARN of the approved runtime IAM permissions boundary.',
      allowedPattern: '^arn:[^:]+:iam::[0-9]{12}:policy/.+$',
      constraintDescription: 'Must be the ARN of an IAM managed policy boundary.',
    });

    const backendLogGroup = new logs.LogGroup(this, 'BackendLogGroup', {
      logGroupName: '/aws/lambda/curtailai-backend',
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    const runtimeRole = new iam.Role(this, 'BackendRuntimeRole', {
      roleName: cdk.Fn.join('', ['curtailai-demo-', cdk.Aws.STACK_NAME, '-runtime']),
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      permissionsBoundary: iam.ManagedPolicy.fromManagedPolicyArn(this, 'RuntimeBoundary', permissionsBoundaryArn.valueAsString),
    });
    runtimeRole.addToPolicy(new iam.PolicyStatement({
      actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
      resources: [backendLogGroup.logGroupArn + ':*'],
    }));

    const repository = ecr.Repository.fromRepositoryName(this, 'BackendRepository', 'curtailai/backend');
    const backendFn = new lambda.DockerImageFunction(this, 'BackendFn', {
      functionName: 'curtailai-backend',
      code: lambda.DockerImageCode.fromEcr(repository),
      architecture: lambda.Architecture.X86_64,
      role: runtimeRole,
      timeout: cdk.Duration.seconds(60), memorySize: 1024,
      environment: {
        DATA_BACKEND: 'mock', CORS_ORIGINS: '*', BEDROCK_ENABLED: 'false', MVP_ONLY_NORDESTE: 'true',
        // Settings rejects 'demo'; absent pickle paths force the existing demo heuristic.
        CURTAILMENT_MODEL_MODE: 'base',
        CURTAILMENT_MODEL_PATH: '/opt/curtailai-demo-disabled/base.pkl',
        CURTAILMENT_MODEL_ADVANCED_PATH: '/opt/curtailai-demo-disabled/advanced.pkl',
      },
      logGroup: backendLogGroup,
    });
    (backendFn.node.defaultChild as lambda.CfnFunction).code = {
      imageUri: cdk.Fn.join('', [repository.repositoryUri, '@', imageDigest.valueAsString]),
    };
    const concurrency = process.env.CURTAILIQ_RESERVED_CONCURRENCY;
    if (concurrency) {
      const parsed = Number(concurrency);
      if (!Number.isInteger(parsed) || parsed < 1) throw new Error('CURTAILIQ_RESERVED_CONCURRENCY must be a positive integer');
      (backendFn.node.defaultChild as lambda.CfnFunction).reservedConcurrentExecutions = parsed;
    }
    const fnUrl = backendFn.addFunctionUrl({ authType: lambda.FunctionUrlAuthType.NONE,
      cors: { allowedOrigins: ['*'], allowedMethods: [lambda.HttpMethod.ALL], allowedHeaders: ['*'], allowCredentials: false },
    });
    const frontendBucket = new s3.Bucket(this, 'FrontendBucket', {
      bucketName: cdk.Fn.join('', ['curtailai-frontend-', cdk.Aws.ACCOUNT_ID, '-', cdk.Aws.REGION]),
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, removalPolicy: cdk.RemovalPolicy.RETAIN, enforceSSL: true,
    });
    const apiDomain = cdk.Fn.select(2, cdk.Fn.split('/', fnUrl.url));
    const distribution = new cloudfront.Distribution(this, 'FrontendDist', {
      defaultBehavior: { origin: origins.S3BucketOrigin.withOriginAccessControl(frontendBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS, cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED },
      additionalBehaviors: { '/api/*': { origin: new origins.HttpOrigin(apiDomain, { protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS, cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER, allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL } },
      defaultRootObject: 'index.html',
    });
    cdk.Tags.of(this).add('Project', 'curtailai');
    new cdk.CfnOutput(this, 'FunctionUrl', { value: fnUrl.url, description: 'Endpoint direto público do Lambda; bypassa CloudFront.' });
    new cdk.CfnOutput(this, 'CloudFrontUrl', { value: `https://${distribution.distributionDomainName}`, description: 'Frontend e API via /api/*.' });
    new cdk.CfnOutput(this, 'BucketName', { value: frontendBucket.bucketName });
    new cdk.CfnOutput(this, 'DistributionId', { value: distribution.distributionId });
  }
}

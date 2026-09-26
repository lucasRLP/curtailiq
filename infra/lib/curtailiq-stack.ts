import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import { Construct } from 'constructs';

export class CurtailIQStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ── Backend: FastAPI via Mangum ─────────────────────────────────────────

    const backendFn = new lambda.Function(this, 'BackendFn', {
      functionName: 'curtailiq-backend',
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: 'lambda_handler.handler',
      code: lambda.Code.fromAsset('lambda-bundle'),
      timeout: cdk.Duration.seconds(60),
      memorySize: 1024,
      environment: {
        DATA_BACKEND: 'mock',
        CORS_ORIGINS: '*',
        CURTAILMENT_MODEL_MODE: 'base',
      },
    });

    // Lambda Function URL — substitui API Gateway (não disponível nesta conta)
    const fnUrl = backendFn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: {
        allowedOrigins: ['*'],
        allowedMethods: [lambda.HttpMethod.ALL],
        allowedHeaders: ['*'],
        allowCredentials: false,
      },
    });

    // ── Frontend: S3 + CloudFront (HTTPS, SPA routing) ─────────────────────

    const frontendBucket = new s3.Bucket(this, 'FrontendBucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      // Bucket privado — acesso somente via CloudFront (OAC)
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    const distribution = new cloudfront.Distribution(this, 'FrontendDist', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(frontendBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      defaultRootObject: 'index.html',
      // React Router: todas as rotas não encontradas servem index.html
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
        },
      ],
    });

    // ── Outputs ─────────────────────────────────────────────────────────────

    new cdk.CfnOutput(this, 'FunctionUrl', {
      value: fnUrl.url,
      description: 'Lambda Function URL do backend — use como VITE_API_BASE (com /api no fim)',
    });

    new cdk.CfnOutput(this, 'CloudFrontUrl', {
      value: `https://${distribution.distributionDomainName}`,
      description: 'URL pública do frontend (HTTPS)',
    });

    new cdk.CfnOutput(this, 'BucketName', {
      value: frontendBucket.bucketName,
      description: 'Bucket S3 — faça upload do front/dist/ aqui após o build',
    });

    new cdk.CfnOutput(this, 'DistributionId', {
      value: distribution.distributionId,
      description: 'ID da distribuição CloudFront — para invalidar cache após upload',
    });
  }
}

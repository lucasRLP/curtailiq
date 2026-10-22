import * as assert from 'node:assert/strict';
import * as vm from 'node:vm';
import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { CurtailIQStack } from '../lib/curtailiq-stack';

const template = Template.fromStack(new CurtailIQStack(new cdk.App(), 'RouterTest'));
const functions: any[] = Object.values(template.findResources('AWS::CloudFront::Function'));
assert.equal(functions.length, 1, 'SPA deeplinks need viewer request rewrite, not S3 error masking');
const code = functions[0].Properties.FunctionCode;
function request(uri: string) {
  return vm.runInNewContext(code + '; handler(event)', {event: { request: {uri} }});
}
assert.equal(request('/curtailai/').uri, '/curtailai/index.html');
assert.equal(request('/curtailai/usinas/123').uri, '/curtailai/index.html');
assert.equal(request('/curtailai/assets/missing.js').uri, '/curtailai/assets/missing.js');
assert.equal(request('/api/missing').uri, '/api/missing');
assert.equal(request('/').statusCode, 302);
assert.equal(request('/').headers.location.value, '/curtailai/');
const dist: any = Object.values(template.findResources('AWS::CloudFront::Distribution'))[0];
assert.equal(dist.Properties.DistributionConfig.DefaultCacheBehavior.FunctionAssociations.length, 1);
assert.equal(dist.Properties.DistributionConfig.CustomErrorResponses, undefined);
console.log('SPA rewrite behavioral contracts passed');

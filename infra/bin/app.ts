#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { CurtailIQStack } from '../lib/curtailiq-stack';

const app = new cdk.App();
new CurtailIQStack(app, 'CurtailIQStack', {
  env: { account: '831926612925', region: 'us-west-2' },
});

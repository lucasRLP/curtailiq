"""Offline authorization behavior; actual AWS verification is a separate gate."""
import unittest
from test_policies import load, allowed, ACCOUNT

class SitePermissions(unittest.TestCase):
    def test_invalidation_only_for_tagged_project_distribution(self):
        policy=load('github-role-policy.json')
        arn=f'arn:aws:cloudfront::{ACCOUNT}:distribution/EXAMPLE'
        for action in ['cloudfront:CreateInvalidation', 'cloudfront:GetInvalidation']:
            self.assertTrue(allowed(policy,action,arn,{'aws:ResourceTag/Project':'curtailai'}))
            self.assertFalse(allowed(policy,action,arn,{'aws:ResourceTag/Project':'other'}))
            self.assertFalse(allowed(policy,action,arn,{}))
            self.assertFalse(allowed(policy,action,'arn:aws:cloudfront::999900001111:distribution/EXAMPLE',{'aws:ResourceTag/Project':'curtailai'}))
        self.assertFalse(allowed(policy,'cloudfront:UpdateDistribution',arn,{'aws:ResourceTag/Project':'curtailai'}))

    def test_cloudformation_can_manage_only_named_router_function(self):
        policy=load('cloudformation-execution-policy.json')
        for action in ['cloudfront:CreateFunction','cloudfront:DescribeFunction','cloudfront:UpdateFunction','cloudfront:PublishFunction','cloudfront:DeleteFunction']:
            self.assertTrue(allowed(policy,action,f'arn:aws:cloudfront::{ACCOUNT}:function/curtailai-demo-spa-router'))
            self.assertFalse(allowed(policy,action,f'arn:aws:cloudfront::{ACCOUNT}:function/unrelated'))

if __name__=='__main__':unittest.main()

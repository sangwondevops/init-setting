import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import {
  ICloudFrontParam,
  ICertificateIdentifier,
} from '../../params/interface';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { CloudFrontConstruct } from '../construct/cloudfront-construct';

interface CloudfrontStackProps extends cdk.StackProps {
  pjPrefix: string;
  webAcl?: wafv2.CfnWebACL;
  cloudFrontParam: ICloudFrontParam;
  CertificateIdentifier: ICertificateIdentifier;
  appAlbs: elbv2.ApplicationLoadBalancer[];
}

export class CloudfrontStack extends cdk.Stack {
  public readonly cfDistributionId: string;

  constructor(scope: Construct, id: string, props: CloudfrontStackProps) {
    super(scope, id, props);

    const cloudFront = new CloudFrontConstruct(
      this,
      `${props.pjPrefix}-CloudFront`,
      {
        webAcl: props.webAcl,
        cloudFrontParam: props.cloudFrontParam,
        CertificateIdentifier: props.CertificateIdentifier,
        appAlbs: [props.appAlbs[0]],
      }
    );
    this.cfDistributionId = cloudFront.cfDistributionId;
  }
}

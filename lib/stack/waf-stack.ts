import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { aws_wafv2 as wafv2 } from 'aws-cdk-lib';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { SHA256 } from 'crypto-js';
import {
  Bucket,
  BucketEncryption,
  BlockPublicAccess,
} from 'aws-cdk-lib/aws-s3';
import { CfnLoggingConfiguration } from 'aws-cdk-lib/aws-wafv2';

export interface WafStackProps extends cdk.StackProps {
  scope: string;
  overrideAction_CommonRuleSet: wafv2.CfnWebACL.OverrideActionProperty;
  overrideAction_KnownBadInputsRuleSet: wafv2.CfnWebACL.OverrideActionProperty;
  overrideAction_AmazonIpReputationList: wafv2.CfnWebACL.OverrideActionProperty;
  overrideAction_LinuxRuleSet: wafv2.CfnWebACL.OverrideActionProperty;
  overrideAction_SQLiRuleSet: wafv2.CfnWebACL.OverrideActionProperty;
  overrideAction_CSCRuleSet: wafv2.CfnWebACL.OverrideActionProperty;
  ruleAction_IPsetRuleSet?: wafv2.CfnWebACL.RuleActionProperty;
  ruleAction_BasicRuleSet?: wafv2.CfnWebACL.RuleActionProperty;
  basicAuthUserName?: string;
  basicAuthUserPass?: string;
  allowIPList?: string[];
  pjPrefix: string;
}

export class WafStack extends cdk.Stack {
  public readonly webAcl: wafv2.CfnWebACL;

  constructor(scope: Construct, id: string, props: WafStackProps) {
    super(scope, id, props);

    let basicAuthToken: string | undefined;
    if (
      props.basicAuthUserName != undefined &&
      props.basicAuthUserPass != undefined
    ) {
      const basicAuthSecret = this.initBasicAuthSecret({
        basicAuthUserName: props.basicAuthUserName,
        basicAuthPassword: props.basicAuthUserPass,
      });
      basicAuthToken = basicAuthSecret.token;

      new ssm.CfnParameter(this, 'maintenanceUserName', {
        type: 'String',
        name: 'maintenanceUserName',
        value: basicAuthSecret.user,
      });

      new ssm.CfnParameter(this, 'maintenanceUserPass', {
        type: 'String',
        name: 'maintenanceUserPass',
        value: basicAuthSecret.pass,
      });
    }

    // WebACLを作成
    const webAcl = new wafv2.CfnWebACL(
      this,
      cdk.Stack.of(this).stackName + 'WebAcl',
      {
        defaultAction: { allow: {} },
        scope: props.scope,
        visibilityConfig: {
          cloudWatchMetricsEnabled: true,
          metricName: 'WebAcl',
          sampledRequestsEnabled: true,
        },
        rules: [
          {
            priority: 1,
            overrideAction: props.overrideAction_CommonRuleSet,
            visibilityConfig: {
              sampledRequestsEnabled: true,
              cloudWatchMetricsEnabled: true,
              metricName: 'AWS-AWSManagedRulesCommonRuleSet',
            },
            name: 'AWSManagedRulesCommonRuleSet',
            statement: {
              managedRuleGroupStatement: {
                vendorName: 'AWS',
                name: 'AWSManagedRulesCommonRuleSet',
              },
            },
          },
          {
            priority: 2,
            overrideAction: props.overrideAction_KnownBadInputsRuleSet,
            visibilityConfig: {
              sampledRequestsEnabled: true,
              cloudWatchMetricsEnabled: true,
              metricName: 'AWS-AWSManagedRulesKnownBadInputsRuleSet',
            },
            name: 'AWSManagedRulesKnownBadInputsRuleSet',
            statement: {
              managedRuleGroupStatement: {
                vendorName: 'AWS',
                name: 'AWSManagedRulesKnownBadInputsRuleSet',
              },
            },
          },
          {
            priority: 3,
            overrideAction: props.overrideAction_AmazonIpReputationList,
            visibilityConfig: {
              sampledRequestsEnabled: true,
              cloudWatchMetricsEnabled: true,
              metricName: 'AWS-AWSManagedRulesAmazonIpReputationList',
            },
            name: 'AWSManagedRulesAmazonIpReputationList',
            statement: {
              managedRuleGroupStatement: {
                vendorName: 'AWS',
                name: 'AWSManagedRulesAmazonIpReputationList',
              },
            },
          },
          {
            priority: 4,
            overrideAction: props.overrideAction_LinuxRuleSet,
            visibilityConfig: {
              sampledRequestsEnabled: true,
              cloudWatchMetricsEnabled: true,
              metricName: 'AWS-AWSManagedRulesLinuxRuleSet',
            },
            name: 'AWSManagedRulesLinuxRuleSet',
            statement: {
              managedRuleGroupStatement: {
                vendorName: 'AWS',
                name: 'AWSManagedRulesLinuxRuleSet',
              },
            },
          },
          {
            priority: 5,
            overrideAction: props.overrideAction_SQLiRuleSet,
            visibilityConfig: {
              sampledRequestsEnabled: true,
              cloudWatchMetricsEnabled: true,
              metricName: 'AWS-AWSManagedRulesSQLiRuleSet',
            },
            name: 'AWSManagedRulesSQLiRuleSet',
            statement: {
              managedRuleGroupStatement: {
                vendorName: 'AWS',
                name: 'AWSManagedRulesSQLiRuleSet',
              },
            },
          },
          ...(props.allowIPList != undefined
            ? [
                this.createIpRule({
                  scope: props.scope,
                  ipList: props.allowIPList,
                  ipRuleSetAction: props.ruleAction_IPsetRuleSet,
                  basicAuthToken: basicAuthToken,
                }),
              ]
            : []),
        ],
      }
    );
    this.webAcl = webAcl;

    const wafLogBucket = new Bucket(this, 'WafLogBucket', {
      bucketName: 'aws-waf-logs-hinagiku'.toLowerCase(),
      encryption: BucketEncryption.S3_MANAGED,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      lifecycleRules: [
        {
          id: 'monthly-rotation',
          expiration: cdk.Duration.days(30),
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(30),
        },
      ],
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });
    new CfnLoggingConfiguration(this, 'WebAclLogging', {
      logDestinationConfigs: [wafLogBucket.bucketArn],
      resourceArn: webAcl.attrArn,
    });
  }

  private initBasicAuthSecret(props: {
    basicAuthUserName: string;
    basicAuthPassword: string;
  }) {
    const passwordHash = SHA256(props.basicAuthPassword).toString().slice(0, 8);

    const authToken = `${props.basicAuthUserName}:${passwordHash}`;
    const encodedAuthToken = Buffer.from(authToken).toString('base64');

    return {
      user: props.basicAuthUserName,
      pass: passwordHash,
      token: encodedAuthToken,
    };
  }

  private createIpRule(props: {
    scope: string;
    ipList: string[];
    ipRuleSetAction?: wafv2.CfnWebACL.RuleActionProperty;
    basicAuthToken?: string;
  }) {
    const ipSet = new wafv2.CfnIPSet(this, 'IPset', {
      name: 'IPset',
      ipAddressVersion: 'IPV4',
      scope: props.scope,
      addresses: props.ipList,
    });

    // This statement is matched when source ip address is not in ipSet.
    const ipRuleStatement: wafv2.CfnWebACL.StatementProperty = {
      notStatement: {
        statement: {
          ipSetReferenceStatement: {
            arn: ipSet.attrArn,
          },
        },
      },
    };
    const statements: wafv2.CfnWebACL.StatementProperty[] = [ipRuleStatement];

    if (props.basicAuthToken != undefined) {
      // This statement is matched when authorization header is not `Basic ${encodedAuthToken}`.
      const basicAuthStatement: wafv2.CfnWebACL.StatementProperty = {
        notStatement: {
          statement: {
            byteMatchStatement: {
              positionalConstraint: 'EXACTLY',
              searchString: `Basic ${props.basicAuthToken}`,
              fieldToMatch: {
                singleHeader: {
                  name: 'authorization',
                },
              },
              textTransformations: [
                {
                  priority: 0,
                  type: 'NONE',
                },
              ],
            },
          },
        },
      };
      statements.push(basicAuthStatement);
    }

    const ipRule: wafv2.CfnWebACL.RuleProperty = {
      priority: 6,
      action: props.ipRuleSetAction,
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: 'IPset',
      },
      name: 'IPset',
      statement: {
        andStatement: {
          statements: statements,
        },
      },
    };

    return ipRule;
  }
}

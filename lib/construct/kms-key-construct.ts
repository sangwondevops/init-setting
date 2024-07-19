import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as iam from 'aws-cdk-lib/aws-iam';

export class KMSKey extends Construct {
  public readonly kmsKey: kms.Key;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    // CMK
    const kmsKey = new kms.Key(this, 'Key', {
      enableKeyRotation: true,
      description: 'Custom KMS key',
      alias: `${id}-for-app`,
    });

    // Permission to access KMS Key from CloudWatch Logs
    kmsKey.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: [
          'kms:Encrypt*',
          'kms:Decrypt*',
          'kms:ReEncrypt*',
          'kms:GenerateDataKey*',
          'kms:Describe*',
        ],
        principals: [
          new iam.ServicePrincipal(
            `logs.${cdk.Stack.of(this).region}.amazonaws.com`
          ),
        ],
        resources: ['*'],
        conditions: {
          ArnLike: {
            'kms:EncryptionContext:aws:logs:arn': `arn:aws:logs:${
              cdk.Stack.of(this).region
            }:${cdk.Stack.of(this).account}:*`,
          },
        },
      })
    );

    this.kmsKey = kmsKey;
  }
}

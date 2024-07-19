import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import { aws_elasticloadbalancingv2 as elbv2 } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { aws_logs as cwl } from 'aws-cdk-lib';
import { aws_servicediscovery as sd } from 'aws-cdk-lib';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { CloudMap } from '../../construct/ecs-app-construct/construct/cloudmap';
import { Pipeline_lambdaConstruct } from './construct/lambda-pipline';
import { EcsCommonConstruct } from '../../construct/ecs-app-construct/construct/ecs-common-construct';
import * as sns from 'aws-cdk-lib/aws-sns';
import { PipelineEcspressoConstruct } from '../ecs-app-construct/construct/pipeline-ecspresso-construct';

interface LambdaConstructProps extends cdk.StackProps {
  prefix: string;
  vpc: ec2.Vpc;
  alarmTopic: sns.Topic;
  securityGroup: ec2.SecurityGroup;
  cloudmap: CloudMap;
}

export class LambdaFrontConstruct extends Construct {
  // Iam Role for Lambda

  constructor(scope: Construct, id: string, props: LambdaConstructProps) {
    super(scope, id);

    // IAM Policy

    const lambda_policy = new iam.ManagedPolicy(this, 'Lambda_policy', {
      managedPolicyName: 'Lambda_basic_policy',
      description: 'IAM policy for Lambda',
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'logs:*',
            'ecr:*',
            'apigateway:*',
            'logs:CreateLogGroup',
            'logs:CreateLogStream',
            'logs:PutLogEvents',
            'ec2:CreateNetworkInterface',
            'ec2:DescribeNetworkInterfaces',
            'ec2:DescribeSubnets',
            'ec2:DeleteNetworkInterface',
            'ec2:AssignPrivateIpAddresses',
            'ec2:UnassignPrivateIpAddresses',
            'servicediscovery:DiscoverInstances',
          ],
          resources: ['*'],
        }),
      ],
    });

    const lambda_role = new iam.Role(this, `Frontend-Role-${props.prefix}`, {
      roleName: 'Lambda-Role', // Output Name
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });
    lambda_role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        'service-role/AWSLambdaBasicExecutionRole'
      )
    );
    lambda_role.addManagedPolicy(lambda_policy);

    new Pipeline_lambdaConstruct(this, `${props.prefix}-FrontApp-Pipeline`, {
      prefix: props.prefix,
      cloudmapService: props.cloudmap.frontendService,
      securityGroup: props.securityGroup,
      vpc: props.vpc,
      executionRole: lambda_role,
    });
  }
}

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
import { EcsCommonConstruct } from '../../ecs-app-construct/construct/ecs-common-construct';
import * as sns from 'aws-cdk-lib/aws-sns';
import { LambdaFrontConstruct } from '../index-lamba';
import { PipelineEcspressoConstruct } from '../../ecs-app-construct/construct/pipeline-ecspresso-construct';

export interface PipelineEcspressoConstructProps extends cdk.StackProps {
  prefix: string;
  securityGroup: ec2.SecurityGroup;
  vpc: ec2.Vpc;
  logGroup?: cwl.LogGroup;
  logGroupForServiceConnect?: cwl.LogGroup;
  cloudmapService: sd.IService;
  executionRole: iam.Role;
}

export class Pipeline_lambdaConstruct extends Construct {
  public readonly LambdaCommon: EcsCommonConstruct;
  constructor(
    scope: Construct,
    id: string,
    props: PipelineEcspressoConstructProps
  ) {
    super(scope, id);

    // Create CodeBuildRole

    const codeBuildRole = new iam.Role(this, 'CodeBuildRole', {
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess'),
      ],
    });

    const codePipelineRole = new iam.Role(this, 'CodePipelineRole', {
      assumedBy: new iam.ServicePrincipal('codepipeline.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess'),
      ],
    });

    const sourceBucket = new s3.Bucket(this, `PipelineSourceBucket`, {
      versioned: true,
      eventBridgeEnabled: true,
    });

    sourceBucket.grantRead(props.executionRole, '.env');

    // sourceBucket.grantRead -> To allow access Permisson for s3 bucket
    const deployProject = new codebuild.PipelineProject(this, 'DeployProject', {
      role: codeBuildRole,
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
      },
      environmentVariables: {
        SECURITY_GROUP: {
          value: props.securityGroup.securityGroupId,
        },
        // Subnet数が3の前提
        SUBNET_1: {
          value: props.vpc.selectSubnets({
            subnetGroupName: 'Private',
          }).subnetIds[0],
        },
        SUBNET_2: {
          value: props.vpc.selectSubnets({
            subnetGroupName: 'Private',
          }).subnetIds[1],
        },
        SUBNET_3: {
          value: props.vpc.selectSubnets({
            subnetGroupName: 'Private',
          }).subnetIds[2],
        },

        REGISTRY_ARN: {
          value: props.cloudmapService.serviceArn,
        },
        ENVFILE_BUCKET_ARN: {
          value: sourceBucket.arnForObjects('.env'),
        },

        SourceBucket: {
          value: sourceBucket.bucketName,
        },
        Role: {
          value: [],
        },
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          pre_build: {
            commands: [
              // 最新バージョンは表示しつつ、installは固定バージョンを使用
              'pwd',

              'aws s3 cp s3://${SourceBucket}/image.zip image.zip',

              'mkdir -p ./unzip_folder',

              'ls -l',

              'unzip -o image.zip -d ./unzip_folder',

              'ls -l ./unzip_folder',
            ],
          },
          build: {
            commands: [
              'pwd',
              'echo "Create to Lambda  is Running"',
              'bash ./unzip_folder/lambda.sh',
              'echo "Lambda has been created"',
            ],
          },
        },
      }),
    });

    // console.log(`소스 버킷 이름 : ${sourceBucket.bucketName}`)

    new cdk.CfnOutput(this, 'SourceBucketName', {
      value: sourceBucket.bucketName,
      description: 'The name of the source bucket',
    });

    deployProject.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'ecs:RegisterTaskDefinition',
          'ecs:ListTaskDefinitions',
          'ecs:DescribeTaskDefinition',
          'ecs:CreateService',
          'ecs:UpdateService',
          'ecs:DescribeServices',
          'application-autoscaling:DescribeScalableTargets',
          'application-autoscaling:RegisterScalableTarget',
          'application-autoscaling:DeregisterScalableTarget',
          'application-autoscaling:PutScalingPolicy',
          'application-autoscaling:DeleteScalingPolicy',
          'application-autoscaling:DescribeScalingPolicies',
          'servicediscovery:GetNamespace',
          'iam:CreateServiceLinkedRole',
          'sts:AssumeRole',
          'lambda:*',
          's3:GetObject',
          'ssm:GetParameter',
          'cloudformation:DescribeStacks',
          'apigateway:GET',
          'iam:AttachRolePolicy',
          'apigateway:POST',
          'iam:PassRole',
          'iam:CreateRole',
          'cloudformation:DescribeStacks',
          'apigateway:GET',
          'apigateway:POST',
          'apigateway:PUT',
          'apigatewayv2:CreateIntegration',
          'apigatewayv2:GetRoutes',
          'apigatewayv2:UpdateStage',
          'apigatewayv2:CreateStage',
          'sts:GetCallerIdentity',
          'servicediscovery:RegisterInstance',
          'servicediscovery:GetNamespace',
        ],
        resources: ['*'],
      })
    );

    const sourceOutput = new codepipeline.Artifact();

    // Code Pipeline Settings
    const sourceAction = new actions.S3SourceAction({
      actionName: 'SourceBucket',
      bucket: sourceBucket,
      bucketKey: 'image.zip',
      output: sourceOutput,
      trigger: actions.S3Trigger.NONE,
    });

    const deployAction = new actions.CodeBuildAction({
      actionName: 'DeployProject',
      input: sourceOutput,
      project: deployProject,
    });

    const pipeline = new codepipeline.Pipeline(this, 'Pipeline', {
      crossAccountKeys: false,
    });

    pipeline.addStage({
      stageName: 'Source',
      actions: [sourceAction],
    });

    pipeline.addStage({
      stageName: 'Deploy',
      actions: [deployAction],
    });

    // Set code pipeline trigger via event bridge
    // When a new object is created in the s3 bucket, it generates an event.
    // That is, whenever the image.zip file is uploaded, the pipeline is executed.
    new events.Rule(this, 'PipelineTriggerEventRule', {
      eventPattern: {
        account: [cdk.Stack.of(this).account],
        source: ['aws.s3'],
        detailType: ['Object Created'],
        detail: {
          bucket: {
            name: [sourceBucket.bucketName],
          },
          object: {
            key: ['image.zip'],
          },
        },
      },
      targets: [new targets.CodePipeline(pipeline)],
    });

    const securityGroupParam = new ssm.StringParameter(
      this,
      'Lambda/Lambda-SecurityGroup',
      {
        parameterName: '/Lambda/Lambda-SecurityGroup',
        stringValue: props.securityGroup.securityGroupId,
      }
    );

    const roleParam = new ssm.StringParameter(this, 'Lambda-Role', {
      parameterName: '/Lambda/Lambda-Role',
      stringValue: props.executionRole.roleArn,
    });

    new ssm.StringParameter(this, 'Lambda-TriggerBucketName', {
      parameterName: '/Hinagiku/TriggerBucket/Lambda-Bucket',
      stringValue: sourceBucket.bucketName,
    });
  }
}

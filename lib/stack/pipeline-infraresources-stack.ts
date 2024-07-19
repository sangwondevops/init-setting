import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as chatbot from 'aws-cdk-lib/aws-chatbot';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as events from 'aws-cdk-lib/aws-events';

export interface InfraResourcesPipelineStackProps {
  slackChannelName: string;
  slackWorkspaceId: string;
  slackChannelId: string;
  env: string;
}

export class InfraResourcesPipelineStack extends cdk.Stack {
  constructor(
    scope: Construct,
    id: string,
    props: InfraResourcesPipelineStackProps
  ) {
    super(scope, id);

    const sourceBucket = new s3.Bucket(this, `SourceBucket`, {
      versioned: true,
      eventBridgeEnabled: true,
    });

    const sourceOutput = new codepipeline.Artifact('SourceArtifact');
    const sourceAction = new actions.S3SourceAction({
      actionName: 'SourceBucket',
      bucket: sourceBucket,
      bucketKey: 'image.zip',
      output: sourceOutput,
      trigger: actions.S3Trigger.NONE, // default: S3Trigger.POLL,option: S3Trigger.EVENT
    });

    const pipeline = new codepipeline.Pipeline(this, `Project`);
    pipeline.addStage({
      stageName: 'Source',
      actions: [sourceAction],
    });

    const buildSpec = codebuild.BuildSpec.fromObject({
      version: '0.2',
      phases: {
        install: {
          commands: [],
        },
        build: {
          commands: [
            'npm install',
            `npx cdk deploy --require-approval never --all -c environment=${props.env}`,
          ],
        },
      },
    });

    const buildProject = new codebuild.PipelineProject(this, 'buildProject', {
      projectName: `${this.stackName}-BuildProject`, //通知時表示されるため、必要に応じて変更。
      timeout: cdk.Duration.minutes(180),
      buildSpec: buildSpec,
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_5_0, // Node.jsをサポートするビルドイメージ
      },
    });
    if (buildProject.role) {
      // CDKAll用のポリシーのアタッチ
      buildProject.addToRolePolicy(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['sts:AssumeRole'],
          resources: ['arn:aws:iam::*:role/cdk-*'],
        })
      );

      const buildAction = new actions.CodeBuildAction({
        actionName: 'CodeBuild',
        project: buildProject,
        input: sourceOutput,
        outputs: [new codepipeline.Artifact()],
      });
      pipeline.addStage({
        stageName: 'Build',
        actions: [buildAction],
      });
      // イベント追加
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

      // Slack使用時のChatBot作成
      const target = new chatbot.SlackChannelConfiguration(
        this,
        `SlackChannel`,
        {
          slackChannelConfigurationName: props.slackChannelName,
          slackWorkspaceId: props.slackWorkspaceId,
          slackChannelId: props.slackChannelId,
        }
      );

      // Slack向け通知ルール作成
      buildProject.notifyOnBuildSucceeded('NotifyOnBuildSucceeded', target);
      buildProject.notifyOnBuildFailed('NotifyOnBuildfailed', target);
      // 必要に応じて、さらにステージやアクションを追加
    }
    new cdk.CfnOutput(this, `SourceBucketName`, {
      value: sourceBucket.bucketName,
    });
  }
}

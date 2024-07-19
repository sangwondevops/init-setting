import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { aws_ec2 as ec2 } from 'aws-cdk-lib';
import { aws_iam as iam } from 'aws-cdk-lib';
import { aws_kms as kms } from 'aws-cdk-lib';
import { aws_ecs as ecs } from 'aws-cdk-lib';
import { aws_ecr as ecr } from 'aws-cdk-lib';
import { aws_logs as cwl } from 'aws-cdk-lib';
import * as imagedeploy from 'cdk-docker-image-deployment';
import * as path from 'path';

export interface BastionECSAppConstructProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  appKey: kms.IKey;
  containerImageTag: string;
  containerConfig: {
    cpu: number;
    memoryLimitMiB: number;
  };
  repositoryName: string;
  ecsTaskExecutionRole: iam.Role;
}

export class BastionECSAppConstruct extends Construct {
  public readonly securityGroup: ec2.SecurityGroup;

  constructor(
    scope: Construct,
    id: string,
    props: BastionECSAppConstructProps
  ) {
    super(scope, id);

    // Create a repository
    const repository = new ecr.Repository(this, props.repositoryName, {
      imageScanOnPush: true,
    });

    // image Deployment
    new imagedeploy.DockerImageDeployment(this, `${id}-ImageDeployment`, {
      source: imagedeploy.Source.directory(
        path.join(__dirname, '../../../../etc/container/bastion', 'docker')
      ),
      destination: imagedeploy.Destination.ecr(repository, {
        tag: 'bastionimage',
      }),
    });

    //ECS TaskRole
    const ecsTaskServiceTaskRole = new iam.Role(
      this,
      `${id}-EcsBastionTaskServiceTaskRole`,
      {
        assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      }
    );
    ecsTaskServiceTaskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: [
          'ssmmessages:CreateControlChannel',
          'ssmmessages:CreateDataChannel',
          'ssmmessages:OpenControlChannel',
          'ssmmessages:OpenDataChannel',
        ],
        resources: ['*'],
      })
    );

    //ECS LogGroup
    const fargateLogGroup = new cwl.LogGroup(this, 'LogGroup', {
      retention: cwl.RetentionDays.THREE_MONTHS,
      encryptionKey: props.appKey,
      logGroupName: cdk.PhysicalName.GENERATE_IF_NEEDED,
    });

    // ECS Task
    const task = new ecs.FargateTaskDefinition(this, `${id}-BastionTaskDef`, {
      executionRole: props.ecsTaskExecutionRole,
      taskRole: ecsTaskServiceTaskRole,
      ...props.containerConfig,
    });

    task.addContainer(`${id}-BastionEcsApp`, {
      image: ecs.ContainerImage.fromEcrRepository(
        repository,
        props.containerImageTag
      ),
      logging: ecs.LogDriver.awsLogs({
        streamPrefix: `${id}-ECSApp-`,
        logGroup: fargateLogGroup,
      }),
    });

    //SecurityGroup
    const securityGroup = new ec2.SecurityGroup(this, `${id}-BastionSG`, {
      vpc: props.vpc,
      allowAllOutbound: true, // for AWS APIs
    });
    this.securityGroup = securityGroup;

    //タスク定義をOutput（run_task.shが参照）
    new cdk.CfnOutput(this, 'taskdefName', {
      value: task.family,
    });

    //SecurityGroupをOutput（run_task.shが参照）
    new cdk.CfnOutput(this, 'securityGroupId', {
      value: securityGroup.securityGroupId,
    });
  }
}

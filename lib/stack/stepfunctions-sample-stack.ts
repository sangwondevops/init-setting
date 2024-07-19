import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as stepfunctions from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as lambda_nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';

export interface StepFunctionsSampleStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  ecsClusterName: string;
  ecsTaskExecutionRole: iam.Role;
  ecsTaskName: string;
}

export class StepFunctionsSampleStack extends cdk.Stack {
  constructor(
    scope: cdk.App,
    id: string,
    props: StepFunctionsSampleStackProps
  ) {
    super(scope, id, props);

    // タスク名からタスクARNを生成
    const ecsTaskDefArn =
      'arn:aws:ecs:' +
      cdk.Stack.of(this).region +
      ':' +
      cdk.Stack.of(this).account +
      ':task-definition/' +
      props.ecsTaskName;

    // Propsで渡されるのはクラスター名のため、ARNを生成し格納
    const ecsClusterArn =
      'arn:aws:ecs:' +
      cdk.Stack.of(this).region +
      ':' +
      cdk.Stack.of(this).account +
      ':cluster/' +
      props.ecsClusterName;

    const iamRoleForStateMachine = new iam.Role(this, 'StepFunctionRole', {
      assumedBy: new iam.ServicePrincipal('states.amazonaws.com'),
    });
    // https://stackoverflow.com/questions/60612853/nested-step-function-in-a-step-function-unknown-error-not-authorized-to-cr
    iamRoleForStateMachine.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['events:PutTargets', 'events:PutRule', 'events:DescribeRule'],
        resources: ['*'],
      })
    );
    iamRoleForStateMachine.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['ecs:RunTask'],
        resources: [ecsTaskDefArn],
      })
    );
    iamRoleForStateMachine.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['iam:PassRole'],
        resources: [props.ecsTaskExecutionRole.roleArn],
      })
    );

    const securityGroupForTask = new ec2.SecurityGroup(this, 'SgTask', {
      vpc: props.vpc,
      allowAllOutbound: true,
    });

    // https://github.com/aws/aws-cdk/issues/2948
    // パラメーターの型を定義
    type RunTaskStateParam = {
      Type: 'Task';
      Resource: 'arn:aws:states:::ecs:runTask.sync';
      Parameters: {
        LaunchType: 'FARGATE';
        Cluster: string;
        TaskDefinition: string;
        NetworkConfiguration: {
          AwsvpcConfiguration: {
            Subnets: string[];
            SecurityGroups: string[];
          };
        };
      };
    };
    // CustomStateでステートメントを作成
    const runTaskParam: RunTaskStateParam = {
      Type: 'Task',
      Resource: 'arn:aws:states:::ecs:runTask.sync',
      Parameters: {
        LaunchType: 'FARGATE',
        Cluster: ecsClusterArn,
        TaskDefinition: ecsTaskDefArn,
        NetworkConfiguration: {
          AwsvpcConfiguration: {
            Subnets: props.vpc.privateSubnets.map(({ subnetId }) => subnetId),
            SecurityGroups: [securityGroupForTask.securityGroupId],
          },
        },
      },
    };

    const ecsTask = new stepfunctions.CustomState(this, 'RunEcsTask', {
      stateJson: runTaskParam,
    });

    const sampleFunction = new lambda_nodejs.NodejsFunction(
      this,
      'SampleFunction',
      {
        entry: path.join(__dirname, '../lambda/batch-sample-app/index.js'),
        runtime: Runtime.NODEJS_16_X,
        handler: 'handler',
      }
    );
    sampleFunction.grantInvoke(iamRoleForStateMachine);

    const lambdaTask = new tasks.LambdaInvoke(this, 'LambdaTask', {
      lambdaFunction: sampleFunction,
    });

    const listEc2Task = new tasks.CallAwsService(this, 'ListEc2', {
      service: 'ec2',
      action: 'describeInstances',
      iamResources: ['*'],
    });

    new stepfunctions.StateMachine(this, 'StateMachine', {
      role: iamRoleForStateMachine,
      definition: lambdaTask.next(ecsTask).next(listEc2Task),
    });
  }
}

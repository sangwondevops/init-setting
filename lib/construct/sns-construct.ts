import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sns from 'aws-cdk-lib/aws-sns';

interface SNSProps extends cdk.StackProps {
  notifyEmail?: string;
}

export class SNS extends Construct {
  public readonly topic: sns.Topic;

  constructor(scope: Construct, id: string, props: SNSProps) {
    super(scope, id);

    // SNS Topic
    const topic = new sns.Topic(this, 'SNSTopic', {
      topicName: cdk.PhysicalName.GENERATE_IF_NEEDED,
    });
    if (props.notifyEmail) {
      new sns.Subscription(this, 'NotifyEmail', {
        endpoint: props.notifyEmail,
        protocol: sns.SubscriptionProtocol.EMAIL,
        topic: topic,
      });
    }
    this.topic = topic;

    // Allow to publish message from CloudWatch
    topic.addToResourcePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal('cloudwatch.amazonaws.com')],
        actions: ['sns:Publish'],
        resources: [topic.topicArn],
      })
    );
  }
}

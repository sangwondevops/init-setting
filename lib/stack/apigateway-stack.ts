import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class ApiGatewayProps extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // API Gateway 생성
    const api = new apigatewayv2.HttpApi(this, 'MyApi', {
      apiName: 'MyServiceHttpApi',
    });

    // API ID를 출력으로 설정
    new cdk.CfnOutput(this, 'ApiId', {
      value: api.apiId,
      exportName: 'Hinagiku-Api-ID',
    });
  }
}

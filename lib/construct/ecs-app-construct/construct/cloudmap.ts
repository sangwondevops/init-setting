import * as cdk from 'aws-cdk-lib';
import * as servicediscovery from 'aws-cdk-lib/aws-servicediscovery';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Duration } from 'aws-cdk-lib';
import { IVpc } from 'aws-cdk-lib/aws-ec2';
import {
  PrivateDnsNamespace,
  DnsRecordType,
  Service,
} from 'aws-cdk-lib/aws-servicediscovery';
import { Construct } from 'constructs';

interface CloudMapProps {
  namespaceName: string;
  vpc: IVpc;
}

export class CloudMap extends Construct {
  public readonly frontendService: Service;
  public readonly backendService: Service;
  public readonly authService: Service;
  public readonly namespace: PrivateDnsNamespace;

  constructor(scope: Construct, id: string, props: CloudMapProps) {
    super(scope, id);

    // Service Discovery NameSpace.
    const namespace = new PrivateDnsNamespace(this, 'Namespace-1', {
      name: props.namespaceName,
      vpc: props.vpc,
    });
    this.namespace = namespace;

    const backendService = namespace.createService('BackendService', {
      name: 'backend',
      dnsRecordType: DnsRecordType.A,
      dnsTtl: Duration.seconds(30),
    });
    this.backendService = backendService;

    const frontendService = namespace.createService('FrontendService', {
      name: 'frontend',
      dnsRecordType: DnsRecordType.A,
      dnsTtl: Duration.seconds(30),
    });
    this.frontendService = frontendService;

    const authService = namespace.createService('AuthService', {
      name: 'auth',
      dnsRecordType: DnsRecordType.A,
      dnsTtl: Duration.seconds(30),
    });
    this.authService = authService;

    new ssm.StringParameter(this, 'lambdaApp-serviceId', {
      parameterName: '/Lambda/serviceId',
      stringValue: frontendService.serviceId,
    });
    new ssm.StringParameter(this, 'lambdaApp-namespace', {
      parameterName: '/Lambda/namespace',
      stringValue: namespace.namespaceId,
    });
  }
}

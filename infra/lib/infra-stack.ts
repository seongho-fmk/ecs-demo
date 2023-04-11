import { Construct } from 'constructs';
import {
  Cluster, ContainerImage,
  CpuArchitecture,
  FargateTaskDefinition,
} from 'aws-cdk-lib/aws-ecs';
import { Repository } from 'aws-cdk-lib/aws-ecr';
import { CfnCacheCluster, CfnSubnetGroup } from 'aws-cdk-lib/aws-elasticache';
import {
  Connections,
  IpAddresses,
  Peer,
  Port,
  SecurityGroup,
  Vpc,
} from 'aws-cdk-lib/aws-ec2';
import {
  ApplicationLoadBalancedFargateService
} from 'aws-cdk-lib/aws-ecs-patterns';
import { Duration, Stack, StackProps } from 'aws-cdk-lib';

export class InfraStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const vpc = new Vpc(this, 'demoVpc', {
      maxAzs: 2,
      ipAddresses: IpAddresses.cidr('192.100.0.0/16')
    })

    const cluster = new Cluster(this, 'demoCluster', {
      vpc,
    });
    // ECR Docker Image
    const repo = Repository.fromRepositoryName(
      this,
      'TestRepository',
      'test'
    );

    // ElasticCache Redis
    // Define a group for telling Elasticache which subnets to put cache nodes in.
    const subnetGroup = new CfnSubnetGroup(
      this,
      'demoSbG',
      {
        subnetIds: vpc.privateSubnets.map(subnet => subnet.subnetId),
        description: 'List of subnets used for the redis cache',
      }
    );
    // The security group that defines network level access to the cluster
    const securityGroup = new SecurityGroup(this, 'demoSG', {
      vpc,
    });
    securityGroup.addIngressRule(
      Peer.anyIpv4(),
      Port.tcp(80),
      'Allow port 80 access from internet'
    );

    const connections = new Connections({
      securityGroups: [securityGroup],
      defaultPort: Port.tcp(6379),
    });

    const cacheCluster = new CfnCacheCluster(
      this,
      'demoCache',
      {
        cacheNodeType: 'cache.t3.micro',
        engine: 'redis',
        numCacheNodes: 1,
        clusterName: 'demo-cache',
        autoMinorVersionUpgrade: true,
        vpcSecurityGroupIds: [securityGroup.securityGroupId],
        cacheSubnetGroupName: subnetGroup.ref,
      }
    );

    const taskDefinition = new FargateTaskDefinition(this, 'demoTd', {
      cpu: 1024,
      memoryLimitMiB: 2048,
      runtimePlatform: {
        cpuArchitecture: CpuArchitecture.ARM64,
      },
    });

    taskDefinition.addContainer('demoContainer', {
      containerName: 'sentinel-core',
      portMappings: [{containerPort: 80, hostPort: 80}],
      image: ContainerImage.fromEcrRepository(repo),
      memoryLimitMiB: 1024,
      cpu: 512,
    });

    const fargate = new ApplicationLoadBalancedFargateService(
      this,
      'demoService',
      {
        cluster,
        desiredCount: 1,
        taskDefinition,
      }
    );
    fargate.targetGroup.setAttribute(
      'deregistration_delay.timeout_seconds',
      '60'
    );
    fargate.targetGroup.configureHealthCheck({
      path: '/',
      timeout: Duration.seconds(60),
      interval: Duration.seconds(70),
      healthyThresholdCount: 3,
      unhealthyThresholdCount: 2,
    });
    connections.allowFrom(fargate.service, Port.tcp(6379));
  }
}

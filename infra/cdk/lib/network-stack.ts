import { CfnOutput, Stack, StackProps, aws_ec2 as ec2 } from "aws-cdk-lib";
import { Construct } from "constructs";
import { StageConfig } from "../config/stage";

export class NetworkStack extends Stack {
  readonly vpc: ec2.Vpc;
  readonly albSecurityGroup: ec2.SecurityGroup;
  readonly backendSecurityGroup: ec2.SecurityGroup;
  readonly redisSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, config: StageConfig, props?: StackProps) {
    super(scope, id, props);
    this.vpc = new ec2.Vpc(this, "Vpc", {
      ipAddresses: ec2.IpAddresses.cidr(config.vpcCidr),
      availabilityZones: config.availabilityZones,
      natGateways: config.natGateways,
      subnetConfiguration: [
        { name: "public", subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: "app", subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 24 },
        { name: "data", subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
    });

    this.vpc.addGatewayEndpoint("DynamoDbEndpoint", {
      service: ec2.GatewayVpcEndpointAwsService.DYNAMODB,
      subnets: [{ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }],
    });

    this.albSecurityGroup = new ec2.SecurityGroup(this, "AlbSecurityGroup", {
      vpc: this.vpc,
      allowAllOutbound: false,
    });
    this.backendSecurityGroup = new ec2.SecurityGroup(this, "BackendSecurityGroup", {
      vpc: this.vpc,
      allowAllOutbound: true,
    });
    this.redisSecurityGroup = new ec2.SecurityGroup(this, "RedisSecurityGroup", {
      vpc: this.vpc,
      allowAllOutbound: false,
    });
    if (config.apiDomain) {
      this.albSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), "HTTPS clients");
    } else {
      this.albSecurityGroup.addIngressRule(ec2.Peer.ipv4(config.vpcCidr), ec2.Port.tcp(80), "VPC infrastructure checks");
    }
    this.albSecurityGroup.addEgressRule(this.backendSecurityGroup, ec2.Port.tcp(3000), "Backend target");
    this.backendSecurityGroup.addIngressRule(this.albSecurityGroup, ec2.Port.tcp(3000), "ALB only");
    this.redisSecurityGroup.addIngressRule(this.backendSecurityGroup, ec2.Port.tcp(6379), "Backend only");

    this.vpc.node.findAll().filter((child): child is ec2.CfnEIP => child instanceof ec2.CfnEIP)
      .forEach((eip, index) => new CfnOutput(this, `NatPublicIp${index + 1}`, { value: eip.ref }));
    new CfnOutput(this, "VpcId", { value: this.vpc.vpcId });
  }
}

import { CfnOutput, RemovalPolicy, Stack, StackProps, aws_ecr as ecr } from "aws-cdk-lib";
import { Construct } from "constructs";
import { StageConfig } from "../config/stage";

export class RegistryStack extends Stack {
  readonly repository: ecr.Repository;

  constructor(scope: Construct, id: string, config: StageConfig, props?: StackProps) {
    super(scope, id, props);
    this.repository = new ecr.Repository(this, "BackendRepository", {
      repositoryName: `blinkmeet-${config.stage}-backend`,
      imageScanOnPush: true,
      imageTagMutability: ecr.TagMutability.IMMUTABLE,
      removalPolicy: config.stage === "dev" ? RemovalPolicy.DESTROY : RemovalPolicy.RETAIN,
      emptyOnDelete: config.stage === "dev",
    });
    new CfnOutput(this, "RepositoryUri", { value: this.repository.repositoryUri });
  }
}

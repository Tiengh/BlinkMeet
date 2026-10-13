import {
  CfnOutput, RemovalPolicy, Stack, StackProps,
  aws_certificatemanager as acm,
  aws_cloudfront as cloudfront,
  aws_cloudfront_origins as origins,
  aws_s3 as s3,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import { StageConfig } from "../config/stage";

export class FrontendStack extends Stack {
  readonly bucket: s3.Bucket;
  readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, config: StageConfig, props?: StackProps) {
    super(scope, id, props);
    this.bucket = new s3.Bucket(this, "FrontendBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      removalPolicy: config.stage === "dev" ? RemovalPolicy.DESTROY : RemovalPolicy.RETAIN,
      autoDeleteObjects: config.stage === "dev",
    });
    const spaRewrite = new cloudfront.Function(this, "SpaRewrite", {
      code: cloudfront.FunctionCode.fromInline(`function handler(event) {
  var request = event.request;
  var uri = request.uri;
  if (uri.indexOf('.') === -1 && uri.indexOf('/api/') !== 0 && uri.indexOf('/socket.io/') !== 0) {
    request.uri = '/index.html';
  }
  return request;
}`),
    });
    this.distribution = new cloudfront.Distribution(this, "FrontendDistribution", {
      domainNames: [config.frontendDomain],
      certificate: acm.Certificate.fromCertificateArn(this, "FrontendCertificate", config.frontendCertificateArn),
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      defaultRootObject: "index.html",
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        functionAssociations: [{ function: spaRewrite, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST }],
      },
    });
    new CfnOutput(this, "FrontendBucketName", { value: this.bucket.bucketName });
    new CfnOutput(this, "CloudFrontDomain", { value: this.distribution.distributionDomainName });
    new CfnOutput(this, "CloudFrontDistributionId", { value: this.distribution.distributionId });
  }
}

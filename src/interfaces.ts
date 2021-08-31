import AWS from 'aws-sdk'

export interface IEC2Params {
  instanceId?: string
  ec2ImageId?: string
  ec2InstanceType?: string
  subnetId?: string
  securityGroupId?: string
  iamRoleName?: string
  tags?: string
  githubOwner?: string
  githubRepo?: string
  label?: string
  githubRegistrationToken?: string
  runnerType?: string
  runnerCount?: number
  region?: string
}

interface Worker {
  getUserData(): string[]
  terminateInstance(): void
}

export interface AWSWorker extends Worker {
  startEc2Instance(): Promise<string>
  waitForInstanceRunning(id: string): void
}

export interface AWSSpotWorker {
  describeSpot(spotReqId: string): Promise<string | undefined>
  getOnDemandPrice(): Promise<string>
  getSpotPrice(): Promise<string>
  startEc2SpotInstance(spotPrice: string): Promise<string>
  requestSpot(
    request: AWS.EC2.RequestSpotInstancesRequest
  ): Promise<AWS.EC2.RequestSpotInstancesResult | undefined>
  waitForSpotInstanceRunning(
    spotResult: AWS.EC2.RequestSpotInstancesResult
  ): void
}

export interface GitHubWorker {
  /* eslint-disable  @typescript-eslint/no-explicit-any */
  getRegistrationToken(): Promise<any>
  getRunner(): Promise<null | any>
  removeRunner(): void
  waitForRunnerRegistered(): void
}

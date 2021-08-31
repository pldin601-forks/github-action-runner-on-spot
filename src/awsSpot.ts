import AWS from 'aws-sdk'
import * as core from '@actions/core'
import * as github from '@actions/github'
import {
  TagSpecificationList,
  TagSpecification,
  TagList,
  Tag,
  CancelSpotInstanceRequestsRequest
} from 'aws-sdk/clients/ec2'
import { AWSSpotWorker, IEC2Params } from './interfaces'
import { onDemandPriceDB } from './ondemand'
import { delay } from './cmd'

export class awsSpotClient implements AWSSpotWorker {
  ec2: AWS.EC2
  params: IEC2Params
  owner: string
  repo: string
  ghToken?: string

  constructor(params: IEC2Params, token?: string) {
    this.ec2 = new AWS.EC2()
    this.params = params
    this.owner = github.context.repo.owner
    this.repo = github.context.repo.repo
    this.ghToken = token
  }

  async terminateInstance(): Promise<void> {
    core.info('Terminate Spot Instance')
    if (this.params.instanceId === undefined) {
      core.error('AWS Spot request ID is undefined')
      throw new Error('ec2SpotRequestId is undefined')
    }

    const data = await this.describeSpot(this.params.instanceId)
    let instanceId = ''
    if (data !== undefined) {
      instanceId = data
    }

    const paramsCancelSpotInstance: CancelSpotInstanceRequestsRequest = {
      SpotInstanceRequestIds: [this.params.instanceId]
    }
    try {
      await this.ec2
        .cancelSpotInstanceRequests(paramsCancelSpotInstance)
        .promise()
      core.info(`AWS  SpotRequest ${this.params.instanceId} is terminated`)
    } catch (error) {
      core.error(`AWS SpotRequest ${this.params.instanceId} termination error`)
      throw error
    }
    await delay(15 * 1000)
    const paramsTerminate = {
      InstanceIds: [instanceId]
    }
    try {
      await this.ec2.terminateInstances(paramsTerminate).promise()
      core.info(`AWS EC2 instance ${instanceId} is terminated`)
      return
    } catch (error) {
      core.error(`AWS EC2 instance ${instanceId} termination error`)
      throw error
    }
  }

  async describeSpot(spotReqId: string): Promise<string | undefined> {
    return new Promise((resolve, reject) => {
      const params = {
        SpotInstanceRequestIds: [spotReqId]
      }
      this.ec2.describeSpotInstanceRequests(params, function (error, data) {
        if (error) {
          core.error(`AWS Describe Spot EC2 instance error: ${error}`)
          reject(error)
        }
        resolve(data.SpotInstanceRequests![0].InstanceId)
      })
    })
  }

  async getOnDemandPrice(): Promise<string> {
    if (this.params.ec2InstanceType !== undefined) {
      const instancedb = onDemandPriceDB.get(this.params.ec2InstanceType)
      if (instancedb !== undefined) return instancedb[0].price
    }
    return '9.99'
  }

  async getSpotPrice(): Promise<string> {
    const end = new Date(Date.now())
    const start = new Date(end.getTime() - 30 * 60 * 1000)
    const paramsSpot = {
      InstanceTypes: [this.params.ec2InstanceType!],
      ProductDescriptions: ['Linux/UNIX (Amazon VPC)'],
      StartTime: start,
      EndTime: end
    }
    try {
      const result = await this.ec2
        .describeSpotPriceHistory(paramsSpot)
        .promise()
      let maxPrice = 0

      for (const item of result.SpotPriceHistory!) {
        const price: number = +item.SpotPrice!
        if (price > maxPrice) {
          maxPrice = price
        }
      }
      return `${maxPrice}`
    } catch (error) {
      core.error(`AWS EC2 Spot instance price history has error`)
      throw error
    }
  }

  async startEc2SpotInstance(spotPrice: string): Promise<string> {
    try {
      const request: AWS.EC2.RequestSpotInstancesRequest = {
        SpotPrice: spotPrice,
        InstanceCount: this.params.runnerCount,
        Type: 'one-time',
        TagSpecifications: getTagSpecification(this.params.tags!, true)
      }

      const userData = this.getUserData()
      request.LaunchSpecification = {
        ImageId: this.params.ec2ImageId!,
        InstanceType: this.params.ec2InstanceType!,
        UserData: Buffer.from(userData.join('\n')).toString('base64'),
        SubnetId: this.params.subnetId!,
        SecurityGroupIds: [this.params.securityGroupId!],
        IamInstanceProfile: { Name: this.params.iamRoleName! }
      }
      const spotReq = await this.requestSpot(request)
      if (spotReq !== undefined) {
        const spotReqID =
          spotReq.SpotInstanceRequests![0].SpotInstanceRequestId !== undefined
            ? spotReq.SpotInstanceRequests![0].SpotInstanceRequestId
            : ''
        core.info(`SpotReqID is  ${spotReqID}`)
        core.setOutput('ec2-spot-request-id', spotReqID)
        const data = await this.describeSpot(spotReqID)
        core.info(`DescribeSpot: AWS EC2 instance is  ${data}`)
        if (data !== undefined) {
          const instanceId = data
          const params = {
            Resources: [instanceId],
            Tags: getTags(this.params.tags!)
          }
          this.ec2.createTags(params, function (err, dataTags) {
            if (err)
              core.error(`AWS EC2 instance error add tags ${err} ${err.stack}`)
            else core.info(`AWS EC2 instance has tags  ${dataTags}`)
          })
          this.ec2.createTags()
        } else {
          core.info(`DescribeSpot: AWS EC2 instance is  undefined`)
        }
        return spotReqID
      }
      core.error('AWS EC2 spot instance request is undefined')
      throw new Error('ec2SpotInstanceRequest is undefined')
    } catch (error) {
      core.error('AWS EC2 instance starting error')
      throw error
    }
  }

  async requestSpot(
    request: AWS.EC2.RequestSpotInstancesRequest
  ): Promise<AWS.EC2.RequestSpotInstancesResult | undefined> {
    return new Promise((resolve, reject) => {
      this.ec2.requestSpotInstances(request, function (error, data) {
        if (error) {
          core.error(`AWS Spot EC2 instance starting error: ${error}`)
          reject(error)
        }
        resolve(data)
      })
    })
  }

  async waitForSpotInstanceRunning(
    spotResult: AWS.EC2.RequestSpotInstancesResult
  ): Promise<void> {
    core.info('waiting for spot instance running')
    if (spotResult === undefined) {
      core.error('AWS EC2 spot instance request is undefined')
      throw new Error('ec2SpotInstanceRequest is undefined')
    }

    const SpotInstanceRequestId =
      spotResult.SpotInstanceRequests![0].SpotInstanceRequestId !== undefined
        ? spotResult.SpotInstanceRequests![0].SpotInstanceRequestId
        : ''

    const params = {
      SpotInstanceRequestIds: [SpotInstanceRequestId]
    }
    let exit = false
    let timeout = 10
    while (!exit) {
      this.ec2.describeSpotInstanceRequests(params, function (error, data) {
        if (error) {
          core.error(`AWS Spot EC2 instance starting error: ${error}`)
          throw new Error('ec2SpotInstanceRequest ${error}')
        }
        if (data.SpotInstanceRequests![0].State === `active`) {
          exit = true
          return
        }
      })
      await delay(15 * 1000)
      timeout = timeout - 1
      if (timeout < 0) {
        exit = true
      }
      core.info(`timeout for waiting spot instance after ${timeout * 15} secs`)
    }
  }

  getUserData(): string[] {
    return [
      '#!/bin/bash',
      'mkdir actions-runner && cd actions-runner',
      'case $(uname -m) in aarch64) ARCH="arm64" ;; amd64|x86_64) ARCH="x64" ;; esac && export RUNNER_ARCH=${ARCH}',
      'curl -O -L https://github.com/actions/runner/releases/download/v2.278.0/actions-runner-linux-${RUNNER_ARCH}-2.278.0.tar.gz',
      'tar xzf ./actions-runner-linux-${RUNNER_ARCH}-2.278.0.tar.gz',
      'export RUNNER_ALLOW_RUNASROOT=1',
      'export DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1',
      `./config.sh --url https://github.com/${this.owner}/${this.repo} --token ${this.ghToken} --labels ${this.params.label}`,
      './run.sh'
    ]
  }
}

/*
function spotRequest(params: type) {
  //https://docs.aws.amazon.com/sdk-for-net/v2/developer-guide/getting-started-spot-instances-net.html
  let ec2 = new AWS.EC2()
  ec2.requestSpotInstances
  //ec2 RequestSpotLaunchSpecification

}
*/

function getTags(param: string): TagList {
  const tagsJSON = JSON.parse(param)
  const tagList: TagList = []
  if (tagsJSON.length > 0) {
    for (const t of tagsJSON) {
      const tag: Tag = {
        Key: t['Key'],
        Value: t['Value']
      }
      tagList.push(tag)
    }
  }
  return tagList
}

function getTagSpecification(
  param: string,
  spot: boolean
): TagSpecificationList {
  core.info('generate TagSpecification')
  const tagSpecifications: TagSpecificationList = []
  let tagS: TagSpecification
  if (spot) {
    tagS = {
      ResourceType: 'spot-instances-request',
      Tags: getTags(param)
    }
  } else {
    tagS = {
      ResourceType: 'instance',
      Tags: []
    }
  }
  tagSpecifications.push(tagS)
  return tagSpecifications
}

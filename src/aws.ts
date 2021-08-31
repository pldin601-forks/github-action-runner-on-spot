import AWS from 'aws-sdk'
import * as core from '@actions/core'
import * as github from '@actions/github'
import {
  TagSpecificationList,
  TagSpecification,
  TagList,
  Tag
} from 'aws-sdk/clients/ec2'
import { AWSWorker, IEC2Params } from './interfaces'

export class awsClient implements AWSWorker {
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
    core.info('Treminate EC2 Instance')
    if (this.params.instanceId === undefined) {
      core.error('AWS EC2 instance ID is undefined')
      throw new Error('ec2InstanceId is undefined')
    }
    const params = {
      InstanceIds: [this.params.instanceId]
    }
    try {
      await this.ec2.terminateInstances(params).promise()
      core.info(`AWS EC2 instance ${this.params.instanceId} is terminated`)
      return
    } catch (error) {
      core.error(`AWS EC2 instance ${this.params.instanceId} termination error`)
      throw error
    }
  }

  async startEc2Instance(): Promise<string> {
    core.info(`Userdata: with label ${this.params.label}`)
    const userData = this.getUserData()
    const Ec2Params = {
      ImageId: this.params.ec2ImageId!,
      InstanceType: this.params.ec2InstanceType!,
      MinCount: 1,
      MaxCount: 1,
      UserData: Buffer.from(userData.join('\n')).toString('base64'),
      SubnetId: this.params.subnetId!,
      SecurityGroupIds: [this.params.securityGroupId!],
      IamInstanceProfile: { Name: this.params.iamRoleName! },
      TagSpecifications: getTagSpecification(this.params.tags!)
    }

    try {
      const result = await this.ec2.runInstances(Ec2Params).promise()
      core.info('Ec2 runInstances is started')
      const ec2InstanceId = result.Instances![0].InstanceId
      this.params.ec2ImageId = ec2InstanceId
      core.info(`AWS EC2 instance ${ec2InstanceId} is started`)
      if (ec2InstanceId === undefined) {
        core.error('AWS EC2 instance starting error')
        throw new Error('ec2InstanceId is undefined')
      }
      await this.waitForInstanceRunning(ec2InstanceId)
      return String(ec2InstanceId)
    } catch (error) {
      core.error('AWS EC2 instance starting error')
      throw error
    }
  }

  async waitForInstanceRunning(id: string): Promise<void> {
    core.info('waiting for instance running')
    if (id === undefined) {
      core.error('AWS EC2 instance ID is undefined')
      throw new Error('ec2InstanceId is undefined')
    }
    const params = {
      InstanceIds: [id]
    }
    try {
      await this.ec2.waitFor('instanceRunning', params).promise()
      core.info(`AWS EC2 instance ${this.params.instanceId} is up and running`)
      return
    } catch (error) {
      core.error(
        `AWS EC2 instance ${this.params.instanceId} initialization error`
      )
      throw error
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

function getTagSpecification(param: string): TagSpecificationList {
  core.info('generate TagSpecification')
  const tagSpecifications: TagSpecificationList = []
  const tagsJSON = JSON.parse(param)
  if (tagsJSON.length > 0) {
    const tagList: TagList = []
    for (const t of tagsJSON) {
      const tag: Tag = {
        Key: t['Key'],
        Value: t['Value']
      }
      tagList.push(tag)
    }
    const tagS: TagSpecification = {
      ResourceType: 'instance',
      Tags: tagList
    }
    tagSpecifications.push(tagS)
  }
  return tagSpecifications
}

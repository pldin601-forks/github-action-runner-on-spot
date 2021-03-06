import * as core from '@actions/core'
import { genLabel, startRunner, stopRunner } from './cmd'
import AWS from 'aws-sdk'
import { IEC2Params } from './interfaces'

async function run(): Promise<void> {
  try {
    const mode = core.getInput('mode')
    if (!mode) {
      throw new Error(`The 'mode' input is not specified`)
    }

    const ghToken: string = core.getInput('github-token')
    if (!ghToken) {
      throw new Error(`The 'github-token' input is not specified`)
    }
    //core.debug(`debug ...`) // debug is only output if you set the secret `ACTIONS_RUNNER_DEBUG` to true
    switch (mode) {
      case `start`:
        await prepareStart()
        break
      case `stop`:
        await prepeareStop()
        break
      default:
        throw new Error('Wrong mode. Allowed values: start, stop.')
    }
  } catch (err) {
    core.setFailed(`error: ${err}`)
  }
}

async function prepareStart(): Promise<void> {
  const runnerCounter = 1
  let awsRegion = core.getInput('region')
  if (!awsRegion) {
    awsRegion = 'us-east1'
  }
  const ghToken: string = core.getInput('github-token')

  let githubRunnerInstall = true

  let amiId: string | undefined = core.getInput('ec2-image-id')
  const regexAmiId = /^ami-.*$/g
  amiId = amiId.trim().replace(/\s/g, '')
  amiId = amiId.length !== 0 && regexAmiId.test(amiId) ? amiId : undefined
  if (amiId === undefined) {
    core.info(`AMI ID is undefined`)
    const ami = await getAMI()
    if (!ami) {
      throw new Error(`No AMI found`)
    }
    amiId = ami
    githubRunnerInstall = false
  }
  core.info(`AMI ID: ${amiId}`)

  const githubRunnerInstallInput = core.getInput('github-runner-install')
  if (githubRunnerInstallInput === 'false') {
    githubRunnerInstall = false
  }
  if (githubRunnerInstallInput === 'true') {
    githubRunnerInstall = true
  }
  core.info(
    `githubRunnerInstall: ${githubRunnerInstall} githubRunnerInstallInput: ${githubRunnerInstallInput}`
  )

  // eslint-disable-next-line i18n-text/no-en
  core.info('Mode Start:')
  const params: IEC2Params = {
    ec2ImageId: amiId,
    ec2InstanceType: core.getInput('ec2-instance-type'),
    subnetId: core.getInput('subnet-id'),
    securityGroupId: core.getInput('security-group-id'),
    iamRoleName: core.getInput('iam-role-name'),
    tags: core.getInput('aws-resource-tags'),
    label: genLabel(),
    runnerType: core.getInput('runner-type'),
    runnerCount: runnerCounter,
    region: awsRegion,
    runnerInstall: githubRunnerInstall
  }

  if (
    !params.ec2ImageId ||
    !params.runnerType ||
    !params.ec2InstanceType ||
    !params.subnetId ||
    !params.securityGroupId
  ) {
    throw new Error(
      `Not all the required inputs are provided for the 'start' mode`
    )
  }
  await startRunner(ghToken, params)
}

async function prepeareStop(): Promise<void> {
  // eslint-disable-next-line i18n-text/no-en
  core.info('Mode Stop:')
  const label = core.getInput('label')
  const ec2InstanceId = core.getInput('ec2-instance-id')
  const spotRequestId = core.getInput('ec2-spot-request-id')
  const runnerType = core.getInput('runner-type')
  const ghToken: string = core.getInput('github-token')
  let requestId: string
  let spot
  if (runnerType === 'spot') {
    spot = true
    requestId = spotRequestId
  } else {
    spot = false
    requestId = ec2InstanceId
  }
  core.debug(
    `Label: ${label}  RequestID: ${requestId} ec2InstanceId: ${ec2InstanceId} spotRequestId: ${spotRequestId}  runnerType: ${runnerType} ${spot} `
  )
  if (!label || !ec2InstanceId) {
    throw new Error(
      `Not all the required inputs are provided for the 'stop' mode`
    )
  }
  await stopRunner(ghToken, label, requestId, spot)
}

async function getAMI(): Promise<string | undefined> {
  const ec2 = new AWS.EC2()

  return await new Promise((resolve, reject) => {
    const params = {
      DryRun: false,
      Filters: [
        {
          Name: 'name',
          Values: ['github-actions-runner/ubuntu-20.04-latest']
        }
      ],
      IncludeDeprecated: false,
      Owners: ['318522186253'] //Restream
    }
    ec2.describeImages(params, function (error, data) {
      if (error) {
        core.error(`AWS Describe AMI error: ${error}`)
        reject(error)
      }

      core.debug(`getAMI found ${JSON.stringify(data)}`)
      // eslint-disable-next-line  @typescript-eslint/no-non-null-assertion
      resolve(data.Images![0].ImageId)
    })
  })
}

run()

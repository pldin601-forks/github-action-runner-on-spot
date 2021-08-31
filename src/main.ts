import * as core from '@actions/core'
import { IEC2Params } from './interfaces'
import { startRunner, stopRunner, genLabel } from './cmd'

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
  } catch (error) {
    core.setFailed(error.message)
  }
}

async function prepareStart(): Promise<void> {
  const runnerCounter = 1
  let awsRegion = core.getInput('region')
  const ghToken: string = core.getInput('github-token')
  if (!awsRegion) {
    awsRegion = 'us-east1'
  }
  core.info('Mode Start:')
  const params: IEC2Params = {
    ec2ImageId: core.getInput('ec2-image-id'),
    ec2InstanceType: core.getInput('ec2-instance-type'),
    subnetId: core.getInput('subnet-id'),
    securityGroupId: core.getInput('security-group-id'),
    iamRoleName: core.getInput('iam-role-name'),
    tags: core.getInput('aws-resource-tags'),
    label: genLabel(),
    runnerType: core.getInput('runner-type'),
    runnerCount: runnerCounter,
    region: awsRegion
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
  const responseID = await startRunner(ghToken, params)
  core.setOutput('label', params.label)
  if (core.getInput('runner-type') === `spot`) {
    core.setOutput('ec2-instance-id', 'none')
    core.setOutput('runner-type', 'spot')
  } else {
    core.setOutput('ec2-instance-id', responseID)
    core.setOutput('ec2-spot-request-id', 'none')
    core.setOutput('runner-type', 'ondemand')
  }
}

async function prepeareStop(): Promise<void> {
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

run()

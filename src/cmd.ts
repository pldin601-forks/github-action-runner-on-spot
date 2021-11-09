import * as core from '@actions/core'
import { IEC2Params } from './interfaces'
import { awsClient } from './aws'
import { awsSpotClient } from './aws_spot'
import { gitHubClient } from './github'

export function genLabel(): string {
  return Math.random().toString(36).substr(2, 5)
}

export async function startRunner(
  token: string,
  params: IEC2Params
): Promise<void> {
  core.info(
    // eslint-disable-next-line i18n-text/no-en
    `Mode Start: start runner with label ${params.label} and type ${params.runnerType}`
  )
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const ghc = new gitHubClient(token, params.label!)
  const ghToken = await ghc.getRegistrationToken()
  let runnerType: string
  let ec2InstanceId: String | undefined
  if (params.runnerType === 'spot') {
    runnerType = 'spot'
    const aws = new awsSpotClient(params, ghToken)
    const spotPrice = await aws.getSpotPrice()
    const ondemandPrice = await aws.getOnDemandPrice()
    const spotPriceInt = parseFloat(spotPrice) * 1000
    const ondemandPriceInt = parseFloat(ondemandPrice) * 1000

    core.info(`SpotPrice: ${spotPrice}`)
    core.info(`On-demandPrice: ${ondemandPrice}`)
    if (spotPriceInt > ondemandPriceInt) {
      // eslint-disable-next-line i18n-text/no-en
      core.info(`Start on-demand instance, bc price`)
      ec2InstanceId = await startOnDemand(params, ghToken)
      runnerType = 'ondemand'
    } else {
      // eslint-disable-next-line i18n-text/no-en
      core.info(`Start spot instance`)
      runnerType = 'spot'
      ec2InstanceId = await aws.startEc2SpotInstance(spotPrice)
    }
  } else {
    runnerType = 'ondemand'
    // eslint-disable-next-line i18n-text/no-en
    core.info(`Start on-demand instance, bc runner type`)
    ec2InstanceId = await startOnDemand(params, ghToken)
  }
  core.info(`runner type after price check: ${runnerType}`)
  core.info(`ec2-instance-id:  ${ec2InstanceId}`)
  await ghc.waitForRunnerRegistered()
  core.setOutput('label', params.label)
  core.setOutput('runner-type', runnerType)
  if (runnerType === `spot`) {
    core.setOutput('ec2-instance-id', 'none')
  } else {
    core.setOutput('ec2-instance-id', ec2InstanceId)
    core.setOutput('ec2-spot-request-id', 'none')
  }
}

export async function stopRunner(
  token: string,
  label: string,
  requestID: string,
  spot: boolean
): Promise<void> {
  // eslint-disable-next-line i18n-text/no-en
  core.info('Mode Stop: stop runner')

  const params: IEC2Params = {
    instanceId: requestID
  }

  let aws: awsSpotClient | awsClient
  if (spot) {
    core.info(`stop Spot Request ${requestID}`)
    aws = new awsSpotClient(params)
  } else {
    core.info(`stop ec2InstanceId ${requestID}`)
    aws = new awsClient(params)
  }
  await aws.terminateInstance()
  const ghc = new gitHubClient(token, label)
  await ghc.removeRunner()
}

async function startOnDemand(
  params: IEC2Params,
  ghToken: string | undefined
): Promise<string> {
  params.runnerType = 'ondemand'
  const aws = new awsClient(params, ghToken)
  return await aws.startEc2Instance()
}

export async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

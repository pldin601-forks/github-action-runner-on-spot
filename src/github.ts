import * as github from '@actions/github'
import * as core from '@actions/core'
import _ from 'lodash'
import { GitHubWorker } from './interfaces'

export class gitHubClient implements GitHubWorker {
  /* eslint-disable  @typescript-eslint/no-explicit-any */
  label: string
  token: string
  owner: string
  repo: string

  constructor(token: string, label: string) {
    this.token = token
    this.label = label
    this.owner = github.context.repo.owner
    this.repo = github.context.repo.repo

    core.debug(`github: ${this.owner} / ${this.repo}`) // debug is only output if you set the secret `ACTIONS_RUNNER_DEBUG` to true
  }

  async getRegistrationToken(): Promise<any> {
    const octokit = github.getOctokit(this.token)
    try {
      const response = await octokit.request(
        'POST /repos/{owner}/{repo}/actions/runners/registration-token',
        { owner: this.owner, repo: this.repo }
      )
      core.info('GitHub Registration Token is received')
      return response.data.token
    } catch (error) {
      core.error('GitHub Registration Token receiving error')
      throw error
    }
  }

  async getRunner(): Promise<null | any> {
    core.info(
      `Get Github runner info  with label  ${this.label}  from ${this.owner}/${this.repo}`
    )
    const octokit = github.getOctokit(this.token)
    try {
      const runners = await octokit.paginate(
        'GET /repos/{owner}/{repo}/actions/runners',
        { owner: this.owner, repo: this.repo }
      )
      const foundRunners = _.filter(runners, { labels: [{ name: this.label }] })
      return foundRunners.length > 0 ? foundRunners[0] : null
    } catch (error) {
      return null
    }
  }

  async removeRunner(): Promise<void> {
    core.info('Remove Github runner ')
    const runner = await this.getRunner()
    if (!runner) {
      core.info(
        `GitHub self-hosted runner with label ${this.label} is not found, so the removal is skipped`
      )
      return
    }
    const octokit = github.getOctokit(this.token)
    try {
      await octokit.request(
        'DELETE /repos/{owner}/{repo}/actions/runners/{runner_id}',
        _.merge(
          { owner: this.owner, repo: this.repo },
          { runner_id: runner.id }
        )
      )
      core.info(`GitHub self-hosted runner ${runner.name} is removed`)
      return
    } catch (error) {
      core.error('GitHub self-hosted runner removal error')
      throw error
    }
  }

  async waitForRunnerRegistered(): Promise<void> {
    core.info('Waiting for registration Github runner')
    const timeoutMinutes = 5
    const retryIntervalSeconds = 10
    const quietPeriodSeconds = 30
    let waitSeconds = 0

    core.info(
      `Waiting ${quietPeriodSeconds}s for the AWS EC2 instance to be registered in GitHub as a new self-hosted runner`
    )
    await new Promise(r => setTimeout(r, quietPeriodSeconds * 1000))
    core.info(
      `Checking every ${retryIntervalSeconds}s if the GitHub self-hosted runner is registered`
    )

    return new Promise((resolve, reject) => {
      const interval = setInterval(async () => {
        const runner = await this.getRunner()

        if (waitSeconds > timeoutMinutes * 60) {
          core.error('GitHub self-hosted runner registration error')
          clearInterval(interval)
          reject(
            new Error(
              `A timeout of ${timeoutMinutes} minutes is exceeded. Your AWS EC2 instance was not able to register itself in GitHub as a new self-hosted runner.`
            )
          )
        }

        if (runner && runner.status === 'online') {
          core.info(
            `GitHub self-hosted runner ${runner.name} is registered and ready to use`
          )
          clearInterval(interval)
          resolve()
        } else {
          waitSeconds += retryIntervalSeconds
          core.info('Checking...')
        }
      }, retryIntervalSeconds * 1000)
    })
  }
}

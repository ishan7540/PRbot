import { createAppAuth } from '@octokit/auth-app'
import { Octokit } from '@octokit/rest'
import config from '../config/index.js'

/**
 * Create an authenticated Octokit client for a specific installation.
 */
export async function getOctokit(installationId) {
  const auth = createAppAuth({
    appId: config.github.appId,
    privateKey: config.github.privateKey,
    installationId,
  })

  const { token } = await auth({ type: 'installation' })
  const octokit = new Octokit({ auth: token })
  return { octokit, token }
}

/**
 * Fetch the diff for a pull request.
 */
export async function getDiff(octokit, repo, prNumber) {
  const [owner, repoName] = repo.split('/')
  const response = await octokit.rest.pulls.get({
    owner,
    repo: repoName,
    pull_number: prNumber,
    mediaType: { format: 'diff' },
  })
  return response.data // raw diff string
}

/**
 * Fetch existing test files from the repo for style matching.
 * Returns up to 5 test files with their contents.
 */
export async function getExistingTests(octokit, repo, sha) {
  const [owner, repoName] = repo.split('/')

  try {
    const { data: tree } = await octokit.rest.git.getTree({
      owner,
      repo: repoName,
      tree_sha: sha,
      recursive: 'true',
    })

    const testFiles = tree.tree
      .filter(
        (f) =>
          f.type === 'blob' &&
          f.path.match(/\.(test|spec)\.(js|ts|jsx|tsx)$/)
      )
      .slice(0, 5)

    const results = []
    for (const file of testFiles) {
      try {
        const { data } = await octokit.rest.git.getBlob({
          owner,
          repo: repoName,
          file_sha: file.sha,
        })
        results.push({
          path: file.path,
          content: Buffer.from(data.content, 'base64').toString('utf-8'),
        })
      } catch {
        // Skip files we can't read
      }
    }

    return results
  } catch {
    return []
  }
}

/**
 * Commit generated test files to the PR branch under __autoqa__/ prefix.
 */
export async function commitGeneratedTests(
  octokit,
  repo,
  branch,
  sha,
  testFiles
) {
  const [owner, repoName] = repo.split('/')

  try {
    // 1. Get the current commit to find the base tree
    const { data: currentCommit } = await octokit.rest.git.getCommit({
      owner,
      repo: repoName,
      commit_sha: sha,
    })

    // 2. Create blobs for each test file
    const blobPromises = testFiles.map(async (file) => {
      const { data: blob } = await octokit.rest.git.createBlob({
        owner,
        repo: repoName,
        content: file.content,
        encoding: 'utf-8',
      })
      return {
        path: `__autoqa__/${file.path}`,
        mode: '100644',
        type: 'blob',
        sha: blob.sha,
      }
    })

    const treeItems = await Promise.all(blobPromises)

    // 3. Create a new tree
    const { data: newTree } = await octokit.rest.git.createTree({
      owner,
      repo: repoName,
      base_tree: currentCommit.tree.sha,
      tree: treeItems,
    })

    // 4. Create a commit
    const { data: newCommit } = await octokit.rest.git.createCommit({
      owner,
      repo: repoName,
      message: '🤖 PRbøt: Add generated tests',
      tree: newTree.sha,
      parents: [sha],
    })

    // 5. Update the branch ref
    await octokit.rest.git.updateRef({
      owner,
      repo: repoName,
      ref: `heads/${branch}`,
      sha: newCommit.sha,
    })

    console.log(`[GitHub] Committed ${testFiles.length} test files to ${branch}`)
  } catch (err) {
    console.error('[GitHub] Failed to commit tests:', err.message)
    // Non-fatal — pipeline continues even if commit fails
  }
}

/**
 * Post a comment on the PR.
 */
export async function postPRComment(octokit, repo, prNumber, body) {
  const [owner, repoName] = repo.split('/')
  await octokit.rest.issues.createComment({
    owner,
    repo: repoName,
    issue_number: prNumber,
    body,
  })
}

/**
 * Set a commit status check.
 */
export async function setCommitStatus(
  octokit,
  repo,
  sha,
  state,
  description
) {
  const [owner, repoName] = repo.split('/')
  await octokit.rest.repos.createCommitStatus({
    owner,
    repo: repoName,
    sha,
    state, // 'success' | 'failure' | 'error' | 'pending'
    description: description.slice(0, 140),
    context: 'prbot/tests',
  })
}

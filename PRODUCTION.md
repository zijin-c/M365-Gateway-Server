# Production Deployment Guidance

This public source package intentionally excludes private deployment history, account identifiers, Worker version identifiers, bundle hashes, local filesystem paths, internal environment names, persistent Wrangler profiles, and production resource identifiers.

## Operator-supplied values

Before deployment, create and review values for your own environment:

- `M365_CLIENT_ID`: your Microsoft Entra public application client ID.
- Cloudflare account and resource identifiers required by your deployment method.
- A unique Worker name and public hostname.
- A persistent KV namespace and required Durable Object migrations.
- Secrets such as `DATA_ENCRYPTION_KEY` and `BOOTSTRAP_ADMIN_PASSWORD`, supplied only through Cloudflare Secrets or another secret manager.

Never copy identifiers, credentials, encrypted account state, or compiled bundles from another deployment.

## Generic update procedure

1. Authenticate to the intended Cloudflare account and verify its identity before making changes.
2. Query and record the currently active deployment version and bindings.
3. Back up configuration metadata without exporting secrets or account data.
4. Install the lockfile dependencies and run all repository checks.
5. Deploy from the reviewed source tree using your own configuration and resource identifiers.
6. Preserve existing secrets and persistent storage bindings during an update.
7. Verify `/api/health`, static assets, protected routes, and model API authentication.
8. Record the result in an operator-controlled system outside the public repository.

## Safe command example

Use placeholders and consult the current Wrangler documentation before deployment:

```powershell
npx wrangler deploy --name <YOUR_WORKER_NAME>
```

Do not place account IDs, namespace IDs, API tokens, passwords, private hostnames, production bundle paths, or generated secret files in source control.

## Verification checklist

- The intended account received the deployment.
- The new version is active and receives the expected traffic.
- `/api/health` reports the expected version and platform state.
- Required bindings are present.
- Secret names are present without exposing their values.
- Static assets and protected routes respond correctly.
- No credentials, account data, private paths, server addresses, or internal domains were added to tracked files.

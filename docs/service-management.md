# Service Management

Create and manage services for a Bedrock project.

Usage:

```
spk service [command] [options]
```

Commands:

- [Service Management](#service-management)
  - [Prerequisites](#prerequisites)
  - [Commands](#commands)
    - [create](#create)
    - [create-pipeline](#create-pipeline)
    - [create-revision](#create-revision)

Global options:

```
  -v, --verbose        Enable verbose logging
  -h, --help           Usage information
```

## Prerequisites

## Commands

### create

Add a new service into this initialized spk project repository

```
Usage:
spk service create|c [options] <service-name>

Options:
  -c, --helm-chart-chart <helm-chart>            bedrock helm chart name. --helm-chart-* and --helm-config-* are exclusive; you may only use one. (default: "")
  -r, --helm-chart-repository <helm-repository>  bedrock helm chart repository. --helm-chart-* and --helm-config-* are exclusive; you may only use one. (default: "")
  -b, --helm-config-branch <helm-branch>         bedrock custom helm chart configuration branch. --helm-chart-* and --helm-config-* are exclusive; you may only use one. (default: "")
  -p, --helm-config-path <helm-path>             bedrock custom helm chart configuration path. --helm-chart-* and --helm-config-* are exclusive; you may only use one. (default: "")
  -g, --helm-config-git <helm-git>               bedrock helm chart configuration git repository. --helm-chart-* and --helm-config-* are exclusive; you may only use one. (default: "")
  -d, --packages-dir <dir>                       The directory containing the mono-repo packages. (default: "")
  -m, --maintainer-name <maintainer-name>        The name of the primary maintainer for this service. (default: "maintainer name")
  -e, --maintainer-email <maintainer-email>      The email of the primary maintainer for this service. (default: "maintainer email")
  --git-push                                     SPK CLI will try to commit and push these changes to a new origin/branch named after the service. (default: false)
  -h, --help                                     output usage information
```

**NOTE:**

`--helm-chart-*` and `--helm-config-*` settings are exclusive. **You may only
use one.**

### create-pipeline

Configure Azure DevOps for a bedrock managed service.

```
Usage: service create-pipeline|p [options] <service-name>

Configure Azure DevOps for a bedrock managed service

Options:
  -n, --pipeline-name <pipeline-name>                  Name of the pipeline to be created
  -p, --personal-access-token <personal-access-token>  Personal Access Token
  -o, --org-name <org-name>                            Organization Name for Azure DevOps
  -r, --repo-name <repo-name>                          Repository Name in Azure DevOps
  -u, --repo-url <repo-url>                            Repository URL
  -d, --devops-project <devops-project>                Azure DevOps Project
  -l, --packages-dir <packages-dir>                    The monorepository directory containing this service definition. ie. '--packages-dir packages' if my-service is located under ./packages/my-service.
  -h, --help                                           output usage information
```

### create-revision

Generate a PR in Azure DevOps against default ring branches

```
Usage: service create-revision|cr [options]

Create pull requests against the branches marked as `isDefault` in your bedrock config

Options:
  -s, --source-branch <source>     Source branch to create the pull request from; defaults to the current branch
  -t, --title <title>              Title of the pull request; not required
  -d, --description <description>  Description of the pull request; not required
  --remote-url <remote-url>        The remote host to create the pull request in; defaults to the URL for 'origin'
  --personal-access-token <pat>    Personal access token associated with your Azure DevOps token; falls back to azure_devops.access_token in your spk config
  --org-name <organization-name>   Your Azure DevOps organization name; falls back to azure_devops.org in your spk config

  -h, --help                       output usage information
```
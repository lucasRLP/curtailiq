#!/usr/bin/env bash
set -Eeuo pipefail
: "${AWS_CFN_EXECUTION_ROLE_ARN:?}" "${AWS_RUNTIME_BOUNDARY_ARN:?}" "${AWS_REGION:?}" "${GITHUB_SHA:?}"
[[ "$GITHUB_SHA" =~ ^[0-9a-f]{40}$ ]]
[[ "$(<release/revision.txt)" == "$GITHUB_SHA" ]]
(cd release && sha256sum --check SHA256SUMS)
# Repository must be provisioned independently with immutable tags; never create or weaken it here.
mutability=$(aws ecr describe-repositories --repository-names curtailai/backend --query 'repositories[0].imageTagMutability' --output text)
[[ "$mutability" == IMMUTABLE ]]
repo=$(aws ecr describe-repositories --repository-names curtailai/backend --query 'repositories[0].repositoryUri' --output text)
registry="${repo%%/*}"
docker load -i release/image.tar
aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$registry"
trap 'docker logout "$registry" >/dev/null' EXIT
# A retry must match the exact previously pushed image; push rejects changed immutable tags.
docker tag "curtailai-ci:$GITHUB_SHA" "$repo:$GITHUB_SHA"
if ! aws ecr describe-images --repository-name curtailai/backend --image-ids "imageTag=$GITHUB_SHA" > release/ecr-existing.json 2>release/ecr-existing.stderr; then
  docker push "$repo:$GITHUB_SHA"
fi
digest=$(aws ecr describe-images --repository-name curtailai/backend --image-ids "imageTag=$GITHUB_SHA" --query 'imageDetails[0].imageDigest' --output text)
[[ "$digest" =~ ^sha256:[a-f0-9]{64}$ ]]
# Pull digest and compare actual config ID to the locally smoke-tested image.
docker pull "$repo@$digest"
[[ "$(docker image inspect "curtailai-ci:$GITHUB_SHA" --format '{{.Id}}')" == "$(docker image inspect "$repo@$digest" --format '{{.Id}}')" ]]
printf '%s\n' "$digest" > release/deployed-digest.txt
aws cloudformation deploy --stack-name curtailai-demo --template-file release/template.json --role-arn "$AWS_CFN_EXECUTION_ROLE_ARN" --capabilities CAPABILITY_NAMED_IAM --parameter-overrides "ImageDigest=$digest" "PermissionsBoundaryArn=$AWS_RUNTIME_BOUNDARY_ARN" --no-fail-on-empty-changeset
aws cloudformation describe-stacks --stack-name curtailai-demo --query 'Stacks[0].Outputs' --output json > release/outputs.json
python scripts/ci/publish-site.py

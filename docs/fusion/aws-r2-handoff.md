# AWS R2 — imagem Lambda: entrega local, sem deploy

## Estado
Implementação local retomada após worker original falhar por rate limit/autenticação. Executor delegado fez alterações reais mas atingiu timeout antes do handoff. O orquestrador reexecutou os gates abaixo. Nenhuma implantação ou execução Docker/Linux foi comprovada. Não há autorização técnica implícita de produção.

## Alterações
- backend/Dockerfile.lambda: Python 3.12/AL2023 em vez de 3.11/AL2; dependências com --require-hashes e --only-binary; handler Mangum; mock e IA desabilitada.
- backend/requirements-lambda-image.in e .txt: dependências completas, Mangum incluído; resolução CPython 3.12 x86_64 manylinux_2_28. Hashes presentes. A imagem base ainda usa tag 3.12, não digest: build não é bit-a-bit imutável.
- backend/Dockerfile.lambda.dockerignore: nome específico reconhecido pelo Docker, allowlist app/data/handler/lock seguida de exclusões de segredos, notebooks, caches e pickles. .dockerignore.lambda anterior é legado e não é utilizado pelo Dockerfile.
- infra/lib/curtailiq-stack.ts, infra/bin/app.ts, infra/test/stack.test.ts, infra/test/lambda-image.test.py: imagem ECR com digest obrigatório, synthesizer sem bootstrap/assets locais, boundary parametrizada, logs-only, S3 privado, retenção, CloudFront API sem cache e sem mascarar erros via fallback SPA.
- CURTAILMENT_MODEL_MODE=demo não é aceito pelo Settings atual. Usado base, com paths de modelos intencionalmente ausentes para não carregar pickle não validado. Não foi modificado o motor de negócio. A aplicação permanece mock; isto não comprova previsão calibrada.

## Contrato para IAM e CI/CD
Stack: curtailai-demo. Repositório ECR importado: curtailai/backend. Função: curtailai-backend. Região/destino devem vir do operador; não há lookup para synth.
Parâmetros exatos do template:
- ImageDigest: obrigatório, ^sha256:[a-f0-9]{64}$, montado como repository@digest.
- PermissionsBoundaryArn: ARN obrigatório de policy IAM previamente criada/revisada. NÃO se chama RuntimePermissionsBoundaryArn.
Outputs exatos: FunctionUrl, CloudFrontUrl, BucketName, DistributionId.
O FunctionUrl é público e pode ser acessado fora do CloudFront; isto precisa ser aceito e não é um mecanismo de autenticação.
Runtime role prefix curtailai-demo-. Bucket curtailai-frontend-${AWS::AccountId}-${AWS::Region}. Tags Project=curtailai.
Build Linux esperado: docker build --platform linux/amd64 -f backend/Dockerfile.lambda backend. Nenhum DockerImageAsset ou build local obrigatório no synth.

## Verificação real do orquestrador
No diretório infra: `npm run build && npm run test:assertions && npx cdk synth --no-lookups --quiet`: exit 0; saída CDK stack assertions passed. Template real infra/cdk.out/curtailai-demo.template.json inspecionado.
Na raiz: `python infra/test/lambda-image.test.py`: 4 testes, OK, exit 0.
Na raiz: `bash docs/fusion/evidence/run_exposure_r3_regression.sh`: exit 0; raw_pytest_exit=1; junit_valid=1; baseline_comparison_exit=0. Evidências: docs/fusion/evidence/exposure-r3-20261021T211917Z-12364/. Comparação: baseline_cases=146/current_cases=175; nenhuma falha/skip/erro novo, nenhum ID legado removido, nenhuma mudança de resultado legado. A suite bruta continua vermelha; NÃO chamá-la verde.

## Evidências do executor (preservadas, não confundidas com execução Linux)
Em docs/fusion/aws-r2-evidence/: image-red e image-red-verified exit 1; image-green exit 0; cdk-red exit 1/cdk-green exit 0; lock-compile exit 0; target-resolution exit 0; wheels-download-target exit 0. Tentativa wheels-download exit 1 e baseline-wrapper exit 1 foram preservadas. O gate de regressão reexecutado pelo orquestrador acima é uma execução posterior distinta, não sobrescreve a tentativa interrompida. Download cross-platform de wheels não é teste de imports em Linux.

## Gates pendentes
Revisão independente local, build e smoke efetivo da imagem em Linux (imports, handler e endpoints), medição de tamanho <10GB, IAM/OIDC revisados, CI real e deploy com digest/SHA correspondentes, frontend /curtailai/ e smoke público. Docker não está disponível localmente. Nenhum link de deploy foi emitido. Não carregar dados reais nem ativar Bedrock automaticamente.

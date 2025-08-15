# Backend template - Lambda Microservices

## Deploy Stack

aws cloudformation deploy --template-file template.yaml \
    --stack-name <STACK_NAME> \
    --parameter-overrides file://parameters.json \
    --capabilities CAPABILITY_NAMED_IAM \
    --region us-east-2

## Undeploy Stack

aws cloudformation delete-stack --stack-name <STACK_NAME>

--Owner Growbiz



## INSTALL

npm install pg @aws-sdk/client-secrets-manager


npm install -D @babel/core @babel/preset-env babel-jest jest



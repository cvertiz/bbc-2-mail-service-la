    ## CREACIÓN DEL STACK
    #aws cloudformation create-stack --stack-name stack-gbzapp001sjp --template-body file://soap-api.yaml --capabilities CAPABILITY_NAMED_IAM --profile petpal_dev

    ## ACTUALIZACIÓN DEL STACK
    #aws cloudformation update-stack --stack-name stack-gbzapp001sjp --template-body file://soap-api.yaml --capabilities CAPABILITY_NAMED_IAM --profile petpal_dev


    #!/bin/bash

    # Carpeta donde se encuentra el código fuente
    SOURCE_FOLDER="./src"

    # Nombre del archivo principal (handler)
    HANDLER_FILE="index.js"

    # Nombre de la función AWS Lambda
    LAMBDA_FUNCTION_NAME="stack-gbzapp001sjp-gbzapp001sjp-6C6KRD7hPPBz"

    # Perfil de AWS CLI
    AWS_PROFILE="petpal_dev"


    S3_BUCKET="growbiz-dev"  # Reemplaza con el nombre de tu bucket S3
    S3_KEY="lambda-functions/$LAMBDA_FUNCTION_NAME.zip"  # Ruta dentro del bucket



    # Empaquetar el contenido de la carpeta src en un archivo ZIP
    zip -r $LAMBDA_FUNCTION_NAME.zip $SOURCE_FOLDER/*  node_modules/* package.json index.js


    # Subir el archivo ZIP a S3
    echo "Subiendo el archivo ZIP a S3..."
    aws s3 cp $LAMBDA_FUNCTION_NAME.zip s3://$S3_BUCKET/$S3_KEY --profile $AWS_PROFILE


    # Crear la función en AWS Lambda
    #'''
    #aws lambda create-function \
    #    --function-name $LAMBDA_FUNCTION_NAME \
    #    --runtime nodejs14.x \
    #    --handler $HANDLER_FILE.handler \
    #    --zip-file fileb://$LAMBDA_FUNCTION_NAME.zip \
    #    --role arn:aws:iam::418334950001:role/bbc-lambda-role \
    #    --profile $AWS_PROFILE
    #'''
    # Actualizar la función en AWS Lambda (si ya existe)
    aws lambda update-function-code \
        --function-name $LAMBDA_FUNCTION_NAME \
        --s3-bucket $S3_BUCKET \
        --s3-key $S3_KEY \
        --profile $AWS_PROFILE

    # Limpiar archivos temporales
    rm $LAMBDA_FUNCTION_NAME.zip

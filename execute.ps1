# Carpeta donde se encuentra el código fuente
$SOURCE_FOLDER = ".\src"
# Nombre del archivo principal (handler)
$HANDLER_FILE = "index.js"
# Nombre de la función AWS Lambda
$LAMBDA_FUNCTION_NAME = "stack-gbzapp001sjp-gbzapp001sjp-6C6KRD7hPPBz"
# Perfil de AWS CLI
$AWS_PROFILE = "petpal_dev"

$S3_BUCKET = "growbiz-dev"  # Reemplaza con el nombre de tu bucket S3
$S3_KEY = "lambda-functions/$LAMBDA_FUNCTION_NAME.zip"  # Ruta dentro del bucket
$ROLE_ARN = "arn:aws:iam::418334950001:role/bbc-lambda-role"  # Reemplaza con el ARN del rol IAM




# Empaquetar el contenido de la carpeta src en un archivo ZIP
Compress-Archive -Path "$SOURCE_FOLDER", "node_modules", "package.json", $HANDLER_FILE -DestinationPath "$LAMBDA_FUNCTION_NAME.zip"

aws s3 cp "$LAMBDA_FUNCTION_NAME.zip" "s3://$S3_BUCKET/$S3_KEY" --profile $AWS_PROFILE

# Actualizar la función en AWS Lambda (si ya existe)
aws lambda update-function-code `
    --function-name $LAMBDA_FUNCTION_NAME `
    --s3-bucket $S3_BUCKET `
    --s3-key $S3_KEY `
    --profile $AWS_PROFILE

# Limpiar archivos temporales
Remove-Item "$LAMBDA_FUNCTION_NAME.zip"
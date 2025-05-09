pipeline {
    agent any
    environment {
        IMAGE_NAME = "silence-remover"
        CONTAINER_NAME = "silence-remover"
        APP_PATH = "/workspace/silence-remover"
    }
    stages {
        stage('Build Docker Image') {
            steps {
                sh '''
                    docker build -t $IMAGE_NAME $APP_PATH
                '''
            }
        }
        stage('Stop & Remove Old Container') {
            steps {
                sh '''
                    docker stop $CONTAINER_NAME || true
                    docker rm $CONTAINER_NAME || true
                '''
            }
        }
        stage('Run New Container') {
            steps {
                sh '''
                    docker run -d --name $CONTAINER_NAME -p 80:80 $IMAGE_NAME
                '''
            }
        }
    }
}

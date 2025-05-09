pipeline {
    agent any
    environment {
        IMAGE_NAME = "silence-remover"
        CONTAINER_NAME = "silence-remover"
    }
    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }
        stage('Build Docker Image') {
            steps {
                dir('silence-remover') {
                    sh 'docker build -t $IMAGE_NAME .'
                }
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
                sh 'docker run -d --name $CONTAINER_NAME -p 80:80 $IMAGE_NAME'
            }
        }
    }
}

pipeline {
    agent any
    environment {
        IMAGE_NAME = "silence-remover"
        CONTAINER_NAME = "silence-remover"
        WORKDIR = "/workspace"
    }
    stages {
        stage('Build Docker Image') {
            steps {
                sh '''
                    cd $WORKDIR
                    docker build -t $IMAGE_NAME .
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
    post {
        success {
            echo '✅ App deployed!'
        }
        failure {
            echo '❌ Build failed.'
        }
    }
}

pipeline {
    agent any
    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }
        stage('Clean Previous Containers') {
            steps {
                sh '''
                    echo "Stopping and removing existing containers if needed..."
                    docker compose -f docker-compose.prod.yml down || true
                    docker rm -f silence-remover || true
                    docker rm -f certbot || true
                '''
            }
        }
        stage('Deploy') {
            steps {
                sh '''
                    docker compose -f docker-compose.prod.yml up -d --build
                '''
            }
        }
    }
}

pipeline {
    agent any

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Clean up old containers') {
            steps {
                sh '''
                    docker compose -f docker-compose.prod.yml down || true
                    docker container prune -f || true
                '''
            }
        }

        stage('Build and Deploy') {
            steps {
                sh '''
                    docker compose -f docker-compose.prod.yml build --no-cache
                    docker compose -f docker-compose.prod.yml up -d
                '''
            }
        }
    }
}

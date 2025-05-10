pipeline {
    agent any
    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }
        stage('Deploy with HTTPS') {
            steps {
                sh '''
                    docker compose -f docker-compose.prod.yml down
                    docker compose -f docker-compose.prod.yml up -d --build
                '''
            }
        }
    }
}

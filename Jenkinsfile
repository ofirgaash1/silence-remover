pipeline {
    agent any

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Pre-clean containers and ports') {
            steps {
                sh '''
                    echo "Stopping existing containers if needed..."
                    docker stop certbot || true
                    docker rm certbot || true
                    docker stop silence-remover || true
                    docker rm silence-remover || true

                    echo "Killing anything listening on port 80..."
                    PID=$(sudo lsof -t -i:80) && [ -n "$PID" ] && sudo kill -9 $PID || true

                    echo "Pruning dangling containers and networks..."
                    docker container prune -f || true
                    docker network prune -f || true
                '''
            }
        }

        stage('Build') {
            steps {
                sh '''
                    echo "Building fresh images..."
                    docker compose -f docker-compose.prod.yml build
                '''
            }
        }

        stage('Deploy') {
            steps {
                sh '''
                    echo "Bringing up only silence-remover (Nginx) container..."
                    docker compose -f docker-compose.prod.yml up -d silence-remover
                '''
            }
        }
    }
}

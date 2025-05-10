pipeline {
    agent any

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Free port 80') {
            steps {
                sh '''
                    echo "Checking for containers using port 80..."
                    PORT_80_CONTAINERS=$(docker ps --format '{{.ID}} {{.Ports}}' | grep ':80->' | awk '{print $1}')
                    if [ ! -z "$PORT_80_CONTAINERS" ]; then
                        echo "Stopping containers using port 80: $PORT_80_CONTAINERS"
                        docker stop $PORT_80_CONTAINERS || true
                    else
                        echo "No container is using port 80."
                    fi
                '''
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
                    PID=$(lsof -t -i:80) && [ -n "$PID" ] && kill -9 $PID || true

                    echo "Pruning unused containers and networks..."
                    docker container prune -f || true
                    docker network prune -f || true
                '''
            }
        }

        stage('Build') {
            steps {
                sh '''
                    echo "Building fresh Docker images..."
                    docker compose -f docker-compose.prod.yml build
                '''
            }
        }

        stage('Deploy') {
            steps {
                sh '''
                    echo "Starting only the web (Nginx) service..."
                    docker compose -f docker-compose.prod.yml up -d web
                '''
            }
        }
    }
}

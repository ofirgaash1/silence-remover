pipeline {
    agent any

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Debug: Check port 80 usage') {
            steps {
                sh '''
                    echo "====[ HOST PORT 80 CHECK ]===="
                    echo "Processes listening on port 80:"
                    ss -tuln | grep ':80' || echo "Nothing is listening on port 80."

                    echo "Docker containers exposing port 80:"
                    docker ps --format '{{.ID}} {{.Names}} {{.Ports}}' | grep ':80->' || echo "No Docker containers using port 80."
                '''
            }
        }

        stage('Free port 80 (Docker only)') {
            steps {
                sh '''
                    echo "Checking for Docker containers using port 80..."
                    PORT_80_CONTAINERS=$(docker ps --format '{{.ID}} {{.Ports}}' | grep ':80->' | awk '{print $1}')
                    if [ ! -z "$PORT_80_CONTAINERS" ]; then
                        echo "Stopping container(s) using port 80: $PORT_80_CONTAINERS"
                        docker stop $PORT_80_CONTAINERS || true
                    else
                        echo "No Docker container is using port 80."
                    fi
                '''
            }
        }

        stage('Pre-clean containers and networks') {
            steps {
                sh '''
                    echo "Stopping and removing known containers..."
                    docker stop certbot || true
                    docker rm certbot || true
                    docker stop silence-remover || true
                    docker rm silence-remover || true

                    echo "Pruning unused Docker resources..."
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
                    echo "Attempting to start only the web (Nginx) service..."
                    docker compose -f docker-compose.prod.yml up -d web
                '''
            }
        }
    }
}

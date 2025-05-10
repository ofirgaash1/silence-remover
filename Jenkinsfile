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
                    echo "Killing any host process using port 80..."
                    PORT80_PID=$(ss -tulnp 2>/dev/null | grep ':80 ' | awk '{print $NF}' | sed 's/.*pid=\\?//;s/,.*//')
                    [ -n "$PORT80_PID" ] && kill -9 $PORT80_PID || echo "Nothing to kill."

                    echo "Stopping Docker containers using port 80..."
                    docker ps --format '{{.ID}} {{.Ports}}' | grep ':80->' | awk '{print $1}' | xargs -r docker stop
                '''
            }
        }

        stage('Clean containers and networks') {
            steps {
                sh '''
                    docker rm -f silence-remover certbot || true
                    docker container prune -f || true
                    docker network prune -f || true
                '''
            }
        }

        stage('Build') {
            steps {
                sh '''
                    docker compose -f docker-compose.prod.yml build
                '''
            }
        }

        stage('Deploy') {
            steps {
                sh '''
                    docker compose -f docker-compose.prod.yml up -d --force-recreate web
                '''
            }
        }
    }
}

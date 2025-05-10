pipeline {
    agent any

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Clean up old containers (optional)') {
            steps {
                sh '''
                    docker compose -f docker-compose.prod.yml down || true
                    docker container prune -f || true
                '''
            }
        }

        stage('Build') {
            steps {
                sh '''
                    docker compose -f docker-compose.prod.yml build --no-cache
                '''
            }
        }

        stage('Run HTTP-only Nginx') {
            steps {
                // Bring up nginx WITHOUT requiring HTTPS certs
                sh '''
                    docker compose -f docker-compose.prod.yml up -d web
                '''
            }
        }

        stage('Obtain SSL Certificates') {
            steps {
                sh '''
                    docker run --rm \
                      -v silence-remover_certbot-etc:/etc/letsencrypt \
                      -v silence-remover_certbot-var:/var/lib/letsencrypt \
                      certbot/certbot certonly \
                      --webroot -w /var/lib/letsencrypt \
                      -d silence-remover.com -d www.silence-remover.com
                '''
            }
        }

        stage('Reload with HTTPS') {
            steps {
                // Restart nginx now that certs are available
                sh '''
                    docker compose -f docker-compose.prod.yml down
                    docker compose -f docker-compose.prod.yml up -d
                '''
            }
        }
    }
}

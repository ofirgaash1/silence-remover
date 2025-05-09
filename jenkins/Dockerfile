FROM jenkins/jenkins:lts

USER root

# Install dependencies
RUN apt-get update && apt-get install -y \
    python3-pip \
    python3-venv \
    awscli \
    unzip \
    docker.io \
    ansible \
    curl \
    git \
    sudo \
    zip

# Add Jenkins user to docker group
RUN groupmod -g 984 docker && usermod -aG docker jenkins

# Copy plugin list and install them
COPY plugins.txt /usr/share/jenkins/ref/plugins.txt
RUN jenkins-plugin-cli --plugin-file /usr/share/jenkins/ref/plugins.txt

# Install Terraform (v1.6.6 example — update as needed)
RUN curl -fsSL https://releases.hashicorp.com/terraform/1.6.6/terraform_1.6.6_linux_amd64.zip -o terraform.zip && \
    unzip terraform.zip && \
    mv terraform /usr/local/bin/ && \
    rm terraform.zip


USER jenkins

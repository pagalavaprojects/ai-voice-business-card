terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

variable "aws_region" {
  default = "us-east-1"
}

resource "aws_ecs_cluster" "ai_platform_cluster" {
  name = "chatbot-ai-platform-cluster"
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.ai_platform_cluster.name
}

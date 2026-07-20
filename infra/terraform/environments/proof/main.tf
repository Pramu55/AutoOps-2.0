resource "aws_vpc" "proof" {
  cidr_block           = "10.42.0.0/24"
  enable_dns_hostnames = true
  enable_dns_support   = true
  instance_tenancy     = "default"

  tags = merge(local.proof_tags, {
    Name = "${local.name_prefix}-vpc"
  })
}

resource "aws_subnet" "public" {
  vpc_id                  = aws_vpc.proof.id
  cidr_block              = "10.42.0.0/25"
  map_public_ip_on_launch = true

  tags = merge(local.proof_tags, {
    Name = "${local.name_prefix}-public-subnet"
  })
}

resource "aws_internet_gateway" "proof" {
  vpc_id = aws_vpc.proof.id

  tags = merge(local.proof_tags, {
    Name = "${local.name_prefix}-igw"
  })
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.proof.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.proof.id
  }

  tags = merge(local.proof_tags, {
    Name = "${local.name_prefix}-public-rt"
  })
}

resource "aws_route_table_association" "public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}

resource "aws_security_group" "proof_instance" {
  name        = "${local.name_prefix}-instance-sg"
  description = "Gate 3 Slice 5A proof host ingress and bootstrap egress"
  vpc_id      = aws_vpc.proof.id

  ingress {
    description = "Approved tester HTTPS only"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [var.approved_ingress_cidr]
  }

  egress {
    description = "HTTPS for SSM, packages, Docker, certificate workflow, and deployment transfer"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "HTTP only for package repositories that require it"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "DNS TCP resolution for bootstrap and SSM endpoints"
    from_port   = 53
    to_port     = 53
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "DNS UDP resolution for bootstrap and SSM endpoints"
    from_port   = 53
    to_port     = 53
    protocol    = "udp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.proof_tags, {
    Name = "${local.name_prefix}-instance-sg"
  })
}

resource "aws_iam_role" "ssm_instance" {
  name = "${local.name_prefix}-ssm-instance"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = merge(local.proof_tags, {
    Name = "${local.name_prefix}-ssm-instance"
  })
}

resource "aws_iam_role_policy_attachment" "ssm_core" {
  role       = aws_iam_role.ssm_instance.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "ssm" {
  name = "${local.name_prefix}-ssm"
  role = aws_iam_role.ssm_instance.name

  tags = merge(local.proof_tags, {
    Name = "${local.name_prefix}-ssm"
  })
}

resource "aws_instance" "proof" {
  ami                         = var.ami_id
  instance_type               = var.instance_type
  subnet_id                   = aws_subnet.public.id
  vpc_security_group_ids      = [aws_security_group.proof_instance.id]
  iam_instance_profile        = aws_iam_instance_profile.ssm.name
  associate_public_ip_address = var.associate_public_ip
  monitoring                  = var.detailed_monitoring
  user_data                   = templatefile("${path.module}/user-data.sh.tftpl", {})

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
    instance_metadata_tags      = "disabled"
  }

  root_block_device {
    volume_type           = "gp3"
    volume_size           = var.root_volume_size_gib
    encrypted             = true
    delete_on_termination = true
  }

  tags = merge(local.proof_tags, {
    Name = "${local.name_prefix}-ec2-proof"
  })
}

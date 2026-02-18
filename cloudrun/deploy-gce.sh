#!/bin/bash
set -euo pipefail

# Configuration
PROJECT_ID="${GCP_PROJECT:-virtual-vm-dev-482406}"
REGION="${REGION:-asia-southeast1}"
ZONE="${ZONE:-asia-southeast1-c}"
VM_NAME="${VM_NAME:-rpc-load-balancer}"
IMAGE_FAMILY="ubuntu-2204-lts"
IMAGE_PROJECT="ubuntu-os-cloud"
MACHINE_TYPE="e2-micro"

# Gateway endpoints
ACTIVE_GATEWAY="${ACTIVE_GATEWAY:-http://34.126.125.90:3848}"
PASSIVE_GATEWAY="${PASSIVE_GATEWAY:-http://34.126.177.240:3848}"
ACTIVE_WS="${ACTIVE_WS:-ws://34.126.125.90:3848/ws}"
PASSIVE_WS="${PASSIVE_WS:-ws://34.126.177.240:3848/ws}"
WS_API_KEYS="${WS_API_KEYS:-}"
ALCHEMY_ENDPOINT="${ALCHEMY_ENDPOINT:-https://starknet-mainnet.g.alchemy.com/starknet/version/rpc/v0_10/_hKu4IgnPgrF8O82GLuYU}"
NETHERMIND_ENDPOINT="${NETHERMIND_ENDPOINT:-https://free-rpc.nethermind.io/mainnet-juno}"

PORT=8080

echo "=== Deploying Starknet Load Balancer to GCE ===" echo "Project: $PROJECT_ID"
echo "Zone: $ZONE"
echo "VM: $VM_NAME"
echo "Port: $PORT"
echo ""
echo "Endpoints:"
echo "  Active:  $ACTIVE_GATEWAY"
echo "  Passive: $PASSIVE_GATEWAY"
echo ""

# Step 1: Check if VM exists
if gcloud compute instances describe "$VM_NAME" --zone="$ZONE" --project="$PROJECT_ID" &>/dev/null; then
    echo "[INFO] VM $VM_NAME already exists"
else
    echo "[1/5] Creating GCE VM..."
    gcloud compute instances create "$VM_NAME" \
        --project="$PROJECT_ID" \
        --zone="$ZONE" \
        --machine-type="$MACHINE_TYPE" \
        --image-family="$IMAGE_FAMILY" \
        --image-project="$IMAGE_PROJECT" \
        --boot-disk-size=10GB \
        --boot-disk-type=pd-standard \
        --tags=http-server,https-server,rpc-gateway \
        --metadata=enable-oslogin=TRUE \
        --scopes=cloud-platform

    echo "Waiting for VM to be ready..."
    sleep 30
fi

# Step 2: Create firewall rule
echo "[2/5] Ensuring firewall rule..."
if ! gcloud compute firewall-rules describe allow-load-balancer --project="$PROJECT_ID" &>/dev/null; then
    gcloud compute firewall-rules create allow-load-balancer \
        --project="$PROJECT_ID" \
        --direction=INGRESS \
        --priority=1000 \
        --network=default \
        --action=ALLOW \
        --rules=tcp:$PORT \
        --source-ranges=0.0.0.0/0 \
        --target-tags=rpc-gateway
fi

# Step 3: Install dependencies on VM
echo "[3/5] Installing Node.js and dependencies..."
gcloud compute ssh "$VM_NAME" --zone="$ZONE" --project="$PROJECT_ID" --command="
    set -e
    # Install Node.js 24
    if ! command -v node &> /dev/null; then
        curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
        sudo apt-get install -y nodejs
    fi

    # Create app directory
    sudo mkdir -p /opt/load-balancer
    sudo chown -R \$USER:\$USER /opt/load-balancer
"

# Step 4: Build and deploy application
echo "[4/5] Building and deploying application..."
cd /home/rick_quantum3labs_com/load-balancer

# Build locally
npm run build

# Create deployment package
DEPLOY_DIR=$(mktemp -d)
cp package.json package-lock.json "$DEPLOY_DIR/"
cp -r dist "$DEPLOY_DIR/"

# Copy to VM
gcloud compute scp --recurse "$DEPLOY_DIR"/* "$VM_NAME:/opt/load-balancer/" \
    --zone="$ZONE" \
    --project="$PROJECT_ID"

rm -rf "$DEPLOY_DIR"

# Install production dependencies on VM
gcloud compute ssh "$VM_NAME" --zone="$ZONE" --project="$PROJECT_ID" --command="
    cd /opt/load-balancer
    npm ci --omit=dev
"

# Step 5: Create systemd service
echo "[5/5] Setting up systemd service..."
gcloud compute ssh "$VM_NAME" --zone="$ZONE" --project="$PROJECT_ID" --command="
    sudo tee /etc/systemd/system/load-balancer.service > /dev/null <<'EOF'
[Unit]
Description=Starknet RPC Load Balancer
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=/opt/load-balancer
Environment=NODE_ENV=production
Environment=PORT=$PORT
Environment=ACTIVE_GATEWAY=$ACTIVE_GATEWAY
Environment=PASSIVE_GATEWAY=$PASSIVE_GATEWAY
Environment=ACTIVE_WS=$ACTIVE_WS
Environment=PASSIVE_WS=$PASSIVE_WS
Environment=WS_API_KEYS=$WS_API_KEYS
Environment=ALCHEMY_ENDPOINT=$ALCHEMY_ENDPOINT
Environment=NETHERMIND_ENDPOINT=$NETHERMIND_ENDPOINT
Environment=WS_PATH=/ws
ExecStart=/usr/bin/node /opt/load-balancer/dist/cloudrun/starknet-gateway-cloudrun.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=load-balancer

[Install]
WantedBy=multi-user.target
EOF

    sudo systemctl daemon-reload
    sudo systemctl enable load-balancer
    sudo systemctl restart load-balancer
    sleep 5
    sudo systemctl status load-balancer --no-pager
"

# Get VM external IP
EXTERNAL_IP=$(gcloud compute instances describe "$VM_NAME" \
    --zone="$ZONE" \
    --project="$PROJECT_ID" \
    --format='get(networkInterfaces[0].accessConfigs[0].natIP)')

echo ""
echo "=== Deployment Complete! ==="
echo ""
echo "VM: $VM_NAME"
echo "External IP: $EXTERNAL_IP"
echo "Port: $PORT"
echo ""
echo "HTTP RPC endpoint:"
echo "  http://${EXTERNAL_IP}:${PORT}"
echo ""
echo "WebSocket endpoint:"
echo "  ws://${EXTERNAL_IP}:${PORT}/ws"
echo ""
echo "Test HTTP:"
echo "  curl -X POST http://${EXTERNAL_IP}:${PORT} \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"jsonrpc\":\"2.0\",\"method\":\"starknet_blockNumber\",\"params\":[],\"id\":1}'"
echo ""
echo "Health check:"
echo "  curl http://${EXTERNAL_IP}:${PORT}/health"
echo ""
echo "View logs:"
echo "  gcloud compute ssh $VM_NAME --zone=$ZONE --project=$PROJECT_ID --command='sudo journalctl -u load-balancer -f'"
echo ""

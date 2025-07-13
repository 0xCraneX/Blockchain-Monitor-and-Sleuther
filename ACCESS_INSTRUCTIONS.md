# How to Access the Polkadot Analysis Tool

The server is running successfully on port 3001. To access the application:

## Access URLs (try in order):

1. **Local container access**: http://172.18.0.2:3001
2. **Standard localhost**: http://localhost:3001
3. **All interfaces**: http://0.0.0.0:3001

## If you're getting ERR_CONNECTION_REFUSED:

This typically means you're trying to access from outside the container. Solutions:

### For Docker users:
```bash
# Make sure you started the container with port mapping:
docker run -p 3001:3001 your-image-name

# Or if using docker-compose, ensure:
ports:
  - "3001:3001"
```

### For cloud/VM users:
1. Check your cloud provider's firewall rules
2. Ensure port 3001 is open for inbound traffic
3. Use your instance's public IP: http://YOUR_PUBLIC_IP:3001

### For WSL2 users:
```bash
# Get your WSL2 IP address:
hostname -I

# Access via: http://YOUR_WSL_IP:3001
```

### For VS Code + Dev Containers:
VS Code should automatically forward the port. Check the "Ports" tab in the terminal panel.

## Verify the server is running:
```bash
# Check if server is listening
curl http://0.0.0.0:3001/api/health

# Check server logs
tail -f server.log
```

## Current server status:
- ✅ Server running on 0.0.0.0:3001
- ✅ All APIs functional
- ✅ Database connected
- ✅ WebSocket ready
- ✅ Frontend loaded with target address: 13RBN6UF43sxkxUrd2H4QSJccvLNGr6HY4v3mN2WtW59WaNk
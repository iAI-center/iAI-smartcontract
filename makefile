deploy-iai-token-polygon-testnet:
	npx ts-node --files ./scripts/cmd/deploy-iai-token.ts --network polygonTestnet
deploy-iai-token-forking-polygon-testnet:
	npx ts-node --files ./scripts/cmd/deploy-iai-token.ts --network forkingPolygonTestnet

deploy-callhelper-polygon-testnet:
	npx ts-node --files ./scripts/cmd/deploy-callhelper.ts --network polygonTestnet
deploy-callhelper-forking-polygon-testnet:
	npx ts-node --files ./scripts/cmd/deploy-callhelper.ts --network forkingPolygonTestnet
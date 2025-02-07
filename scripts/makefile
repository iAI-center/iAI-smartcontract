# Network configurations
POLYGON_TESTNET := polygonTestnet
FORKING_POLYGON_TESTNET := forkingPolygonTestnet
BSC_TESTNET := bscTestnet
FORKING_BSC_TESTNET := forkingBscTestnet

POLYGON_MAINNET := polygonMainnet
FORKING_POLYGON_MAINNET := forkingPolygonMainnet
BSC_MAINNET := bscMainnet
FORKING_BSC_MAINNET := forkingBscMainnet

# Input directory for Polygon network family
POLYGON_TESTNET_INPUT_DIR := polygon-testnet
POLYGON_MAINNET_INPUT_DIR := polygon-mainnet

# Input directory for Nsc network family
BSC_TESTNET_INPUT_DIR := bsc-testnet
BSC_MAINNET_INPUT_DIR := bsc-mainnet

# Contracts directory
CONTRACTS_DIR := ../contracts

# Input file paths for Polygon network family
POLYGON_IAI_TOKEN_INPUT := $(POLYGON_TESTNET_INPUT_DIR)/iai-token.json
POLYGON_CALLHELPER_INPUT := $(POLYGON_TESTNET_INPUT_DIR)/callhelper.json
POLYGON_REWARD_DIST_INPUT := $(POLYGON_TESTNET_INPUT_DIR)/reward-distributor.json
POLYGON_ADD_FUNDS_INPUT := $(POLYGON_TESTNET_INPUT_DIR)/add-funds.json
POLYGON_DEPLOY_PRESALE_INPUT_TESTNET := $(POLYGON_TESTNET_INPUT_DIR)/deploy-presale-private.json
POLYGON_DEPLOY_PRESALE_INPUT_MAINNET := $(POLYGON_MAINNET_INPUT_DIR)/deploy-presale-private.json
POLYGON_DEPLOY_PRESALE_V2_INPUT_TESTNET := $(POLYGON_TESTNET_INPUT_DIR)/deploy-presale-v2-private.json

# Input file paths for Bsc network family
BSC_DEPLOY_PRESALE_INPUT_TESTNET := $(BSC_TESTNET_INPUT_DIR)/deploy-presale-private.json
BSC_DEPLOY_PRESALE_INPUT_MAINNET := $(BSC_MAINNET_INPUT_DIR)/deploy-presale-private.json

BSC_DEPLOY_PRESALE_V2_INPUT_TESTNET := $(BSC_TESTNET_INPUT_DIR)/deploy-presale-v2-private.json

# Task templates
define run-script
npx ts-node --files ../scripts/cmd/$(1).ts --input ../scripts/input/$(2) --network $(3) $(4)
endef

define run-contract-deployment
$(call run-script,$(1),$(2),$(3),--contracts $(CONTRACTS_DIR))
endef

define run-deploy-all
npx ts-node --files ../scripts/cmd/$(1).ts --network $(2) --contracts $(CONTRACTS_DIR)
endef

####################################################################################################
### Polygon Testnet
####################################################################################################

# Polygon Testnet specific tasks
deploy-iai-token-polygon-testnet:
	$(call run-contract-deployment,deploy-iai-token,$(POLYGON_IAI_TOKEN_INPUT),$(POLYGON_TESTNET))

deploy-callhelper-polygon-testnet:
	$(call run-contract-deployment,deploy-callhelper,$(POLYGON_CALLHELPER_INPUT),$(POLYGON_TESTNET))

deploy-reward-distributor-polygon-testnet:
	$(call run-contract-deployment,deploy-reward-distributor,$(POLYGON_REWARD_DIST_INPUT),$(POLYGON_TESTNET))

add-funds-polygon-testnet:
	$(call run-script,add-funds-to-reward-distributor,$(POLYGON_ADD_FUNDS_INPUT),$(POLYGON_TESTNET))

deploy-all-polygon-testnet:
	$(call run-deploy-all,deploy-all,$(POLYGON_TESTNET))

deploy-iai-presale-private-polygon-testnet:
	$(call run-contract-deployment,deploy-presale,$(POLYGON_DEPLOY_PRESALE_INPUT_TESTNET),$(POLYGON_TESTNET))

deploy-iai-presale-v2-private-polygon-testnet:
	$(call run-contract-deployment,deploy-presale-v2,$(POLYGON_DEPLOY_PRESALE_V2_INPUT_TESTNET),$(POLYGON_TESTNET))

####################################################################################################
### Forking Polygon Testnet
####################################################################################################

# Forking Polygon Testnet specific tasks (using same input files)
deploy-iai-token-forking-polygon-testnet:
	$(call run-contract-deployment,deploy-iai-token,$(POLYGON_IAI_TOKEN_INPUT),$(FORKING_POLYGON_TESTNET))

deploy-callhelper-forking-polygon-testnet:
	$(call run-contract-deployment,deploy-callhelper,$(POLYGON_CALLHELPER_INPUT),$(FORKING_POLYGON_TESTNET))

deploy-reward-distributor-forking-polygon-testnet:
	$(call run-contract-deployment,deploy-reward-distributor,$(POLYGON_REWARD_DIST_INPUT),$(FORKING_POLYGON_TESTNET))

add-funds-forking-polygon-testnet:
	$(call run-script,add-funds-to-reward-distributor,$(POLYGON_ADD_FUNDS_INPUT),$(FORKING_POLYGON_TESTNET))

deploy-all-forking-polygon-testnet:
	$(call run-deploy-all,deploy-all,$(FORKING_POLYGON_TESTNET))

deploy-iai-presale-private-forking-polygon-testnet:
	$(call run-contract-deployment,deploy-presale,$(POLYGON_DEPLOY_PRESALE_INPUT_TESTNET),$(FORKING_POLYGON_TESTNET))

deploy-iai-presale-v2-private-forking-polygon-testnet:
	$(call run-contract-deployment,deploy-presale-v2,$(POLYGON_DEPLOY_PRESALE_V2_INPUT_TESTNET),$(FORKING_POLYGON_TESTNET))

####################################################################################################
### Polygon Mainnet
####################################################################################################

deploy-iai-presale-private-polygon-mainnet:
	$(call run-contract-deployment,deploy-presale,$(POLYGON_DEPLOY_PRESALE_INPUT_MAINNET),$(POLYGON_MAINNET))

####################################################################################################
### Forking Polygon Mainnet
####################################################################################################

deploy-iai-presale-private-forking-polygon-mainnet:
	$(call run-contract-deployment,deploy-presale,$(POLYGON_DEPLOY_PRESALE_INPUT_MAINNET),$(FORKING_POLYGON_MAINNET))


####################################################################################################
### BSC Testnet
####################################################################################################

deploy-iai-presale-private-bsc-testnet:
	$(call run-contract-deployment,deploy-presale,$(BSC_DEPLOY_PRESALE_INPUT_TESTNET),$(BSC_TESTNET))

deploy-iai-presale-v2-private-bsc-testnet:
	$(call run-contract-deployment,deploy-presale-v2,$(BSC_DEPLOY_PRESALE_V2_INPUT_TESTNET),$(BSC_TESTNET))


####################################################################################################
### Forking BSC Testnet
####################################################################################################

deploy-iai-presale-private-forking-bsc-testnet:
	$(call run-contract-deployment,deploy-presale,$(BSC_DEPLOY_PRESALE_INPUT_TESTNET),$(FORKING_BSC_TESTNET))
	
deploy-iai-presale-v2-private-forking-bsc-testnet:
	$(call run-contract-deployment,deploy-presale-v2,$(BSC_DEPLOY_PRESALE_V2_INPUT_TESTNET),$(FORKING_BSC_TESTNET))


####################################################################################################
### BSC MAINNET
####################################################################################################

deploy-iai-presale-private-bsc-mainnet:
	$(call run-contract-deployment,deploy-presale,$(BSC_DEPLOY_PRESALE_INPUT_MAINNET),$(BSC_MAINNET))


####################################################################################################
### Forking BSC MAINNET
####################################################################################################

deploy-iai-presale-private-forking-bsc-mainnet:
	$(call run-contract-deployment,deploy-presale,$(BSC_DEPLOY_PRESALE_INPUT_MAINNET),$(FORKING_BSC_MAINNET))

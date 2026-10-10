#!/bin/bash
RUN_ID=37990162943
while true; do
  STATUS=$(gh run view $RUN_ID --json status -q .status)
  CONCLUSION=$(gh run view $RUN_ID --json conclusion -q .conclusion)
  echo "Status: $STATUS, Conclusion: $CONCLUSION"
  if [ "$STATUS" == "completed" ]; then
    break
  fi
  sleep 10
done

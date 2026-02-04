#!/bin/bash
cd /home/kavia/workspace/code-generation/online-chess-matchmaker-314945-314959/chess_frontend
npm run build
EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
   exit 1
fi

